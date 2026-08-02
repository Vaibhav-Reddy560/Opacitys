"use client";

import { useCallback, useRef, useState } from "react";

export type VoiceState =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "processing"
  | "error";

export type VoiceErrorKind = "permission-denied" | "not-configured" | "network" | "unknown";

interface UseVoiceToTextResult {
  state: VoiceState;
  interimText: string;
  error: { kind: VoiceErrorKind; message: string } | null;
  start: () => void;
  stop: () => void;
}

const DEEPGRAM_LISTEN_URL =
  "wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true&punctuate=true";

/**
 * Two-stage voice-to-text: (1) the browser streams audio straight to
 * Deepgram over a scoped, short-lived token (minted by /api/voice/token) for
 * real-time transcription, then (2) once recording stops, the accumulated
 * transcript is passed through /api/voice/cleanup — the existing AI Gateway
 * pipeline — to strip filler words and fix formatting. Stage 2 is the actual
 * "high-end, not cheap" differentiator; stage 1 alone would just be raw ASR.
 */
export function useVoiceToText(onFinalText: (text: string) => void): UseVoiceToTextResult {
  const [state, setState] = useState<VoiceState>("idle");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<{ kind: VoiceErrorKind; message: string } | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const finalChunksRef = useRef<string[]>([]);

  const teardown = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
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
    setInterimText("");
    finalChunksRef.current = [];
    setState("requesting-permission");

    let tokenRes: Response;
    try {
      tokenRes = await fetch("/api/voice/token", { method: "POST" });
    } catch {
      fail("network", "Could not reach the server to start voice input.");
      return;
    }
    if (!tokenRes.ok) {
      const body = await tokenRes.json().catch(() => null);
      fail(
        tokenRes.status === 503 ? "not-configured" : "network",
        body?.error ?? "Could not start voice input.",
      );
      return;
    }
    const { key } = await tokenRes.json();

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("permission-denied", "Microphone access was denied.");
      return;
    }
    streamRef.current = stream;

    const socket = new WebSocket(DEEPGRAM_LISTEN_URL, ["token", key]);
    socketRef.current = socket;

    socket.onopen = () => {
      setState("recording");
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          socket.send(e.data);
        }
      };
      recorder.start(250);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const transcript: string | undefined = msg?.channel?.alternatives?.[0]?.transcript;
        if (!transcript) return;
        if (msg.is_final) {
          finalChunksRef.current.push(transcript);
          setInterimText("");
        } else {
          setInterimText(transcript);
        }
      } catch {
        // Non-JSON keepalive frames are expected — ignore.
      }
    };

    socket.onerror = () => {
      fail("network", "The voice connection dropped unexpectedly.");
    };
  }, [fail]);

  const stop = useCallback(async () => {
    if (state !== "recording") return;
    teardown();

    const raw = finalChunksRef.current.join(" ").trim();
    finalChunksRef.current = [];
    setInterimText("");

    if (!raw) {
      setState("idle");
      return;
    }

    setState("processing");
    try {
      const res = await fetch("/api/voice/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawTranscript: raw }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not clean up the transcript.");
      onFinalText(json.cleanedText);
      setState("idle");
    } catch (err) {
      fail("network", err instanceof Error ? err.message : "Could not clean up the transcript.");
    }
  }, [state, teardown, onFinalText, fail]);

  return { state, interimText, error, start, stop };
}
