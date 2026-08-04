"use client";

import { useCallback, useRef, useState } from "react";
import { readJsonSafe } from "@/lib/http";

export type VoiceState =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "transcribing"
  | "processing"
  | "error";

export type VoiceErrorKind = "permission-denied" | "not-configured" | "network" | "unknown";

interface UseVoiceToTextResult {
  state: VoiceState;
  error: { kind: VoiceErrorKind; message: string } | null;
  start: () => void;
  stop: () => void;
}

/**
 * Two-stage voice-to-text, both stages via Groq (open-source models, no
 * credit card required): (1) the full clip is recorded client-side, then on
 * stop uploaded to /api/voice/transcribe for Whisper transcription — Groq's
 * transcription endpoint isn't a streaming API, so there's no live interim
 * text the way there was with Deepgram; (2) the raw transcript is passed
 * through /api/voice/cleanup to strip filler words and fix formatting — the
 * actual "high-end, not cheap" differentiator.
 */
export function useVoiceToText(onFinalText: (text: string) => void): UseVoiceToTextResult {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<{ kind: VoiceErrorKind; message: string } | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const teardown = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const fail = useCallback(
    (kind: VoiceErrorKind, message: string) => {
      teardown();
      setError({ kind, message });
      setState("error");
    },
    [teardown],
  );

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    setState("requesting-permission");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("permission-denied", "Microphone access was denied.");
      return;
    }
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    setState("recording");
  }, [fail]);

  const stop = useCallback(async () => {
    if (state !== "recording") return;
    const recorder = recorderRef.current;
    if (!recorder) return;

    const clip = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorder.stop();
    });
    teardown();
    chunksRef.current = [];

    if (clip.size === 0) {
      setState("idle");
      return;
    }

    setState("transcribing");
    try {
      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/webm" },
        body: clip,
      });
      const transcribeJson = await readJsonSafe<{ rawTranscript?: string; error?: string }>(transcribeRes);
      if (!transcribeRes.ok) {
        fail(
          transcribeRes.status === 503 ? "not-configured" : "network",
          transcribeJson.error ?? "Could not transcribe that.",
        );
        return;
      }
      const raw = (transcribeJson.rawTranscript ?? "").trim();
      if (!raw) {
        setState("idle");
        return;
      }

      setState("processing");
      const cleanupRes = await fetch("/api/voice/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawTranscript: raw }),
      });
      const cleanupJson = await readJsonSafe<{ cleanedText?: string; error?: string }>(cleanupRes);
      if (!cleanupRes.ok) throw new Error(cleanupJson.error ?? "Could not clean up the transcript.");
      onFinalText(cleanupJson.cleanedText ?? raw);
      setState("idle");
    } catch (err) {
      fail("network", err instanceof Error ? err.message : "Could not clean up the transcript.");
    }
  }, [state, teardown, onFinalText, fail]);

  return { state, error, start, stop };
}
