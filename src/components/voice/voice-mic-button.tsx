"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceToText } from "@/lib/voice/use-voice-to-text";

const ERROR_COPY: Record<string, string> = {
  "permission-denied": "Microphone access was denied — allow it in your browser's site settings and try again.",
  "not-configured": "Voice input isn't configured yet.",
  network: "Lost the connection — try again.",
  unknown: "Something went wrong with voice input.",
};

/**
 * The sitewide voice-to-text control. Owns none of the transcription logic
 * itself — that lives in useVoiceToText — this is purely the idle/recording/
 * processing/error presentation.
 */
export function VoiceMicButton({
  onFinalText,
  className,
  size = 36,
}: {
  onFinalText: (text: string) => void;
  className?: string;
  size?: number;
}) {
  const { state, interimText, error, start, stop } = useVoiceToText(onFinalText);

  return (
    <div className={cn("inline-flex items-start gap-2.5", className)}>
      <button
        type="button"
        onClick={state === "recording" ? stop : start}
        disabled={state === "requesting-permission" || state === "processing"}
        aria-label={
          state === "recording"
            ? "Stop dictating"
            : state === "processing"
              ? "Cleaning up dictation"
              : "Start dictating"
        }
        className={cn(
          "relative grid shrink-0 place-items-center rounded-full border transition-colors disabled:cursor-wait",
          state === "recording"
            ? "border-transparent bg-[oklch(0.66_0.22_15)] text-white"
            : state === "error"
              ? "border-[oklch(0.66_0.22_15_/_0.4)] text-[oklch(0.72_0.19_18)]"
              : "border-white/12 bg-white/[0.04] text-foreground/72 hover:bg-white/[0.08]",
        )}
        style={{ width: size, height: size }}
      >
        {state === "recording" && (
          <span
            aria-hidden
            className="absolute inset-0 animate-ping rounded-full bg-[oklch(0.66_0.22_15)] opacity-40"
          />
        )}
        {state === "processing" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : state === "error" ? (
          <MicOff className="size-4" aria-hidden />
        ) : (
          <Mic className="relative z-10 size-4" aria-hidden />
        )}
      </button>

      <div className="min-w-0 pt-1.5 text-[12px] leading-relaxed">
        {state === "recording" && (
          <p className="text-foreground/62">
            {interimText ? (
              <span className="italic text-foreground/75">{interimText}</span>
            ) : (
              "Listening…"
            )}
          </p>
        )}
        {state === "processing" && <p className="text-foreground/62">Cleaning up…</p>}
        {state === "error" && error && (
          <p role="alert" style={{ color: "oklch(0.72 0.19 18)" }}>
            {ERROR_COPY[error.kind] ?? error.message}
          </p>
        )}
      </div>
    </div>
  );
}
