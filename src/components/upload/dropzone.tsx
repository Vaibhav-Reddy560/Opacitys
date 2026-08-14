"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { UploadCloud, AlertCircle, MapPin, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";
import {
  captureLocation,
  readLocationPreference,
  writeLocationPreference,
  type Fix,
} from "@/lib/geo/capture";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 25 * 1024 * 1024;

interface DropzoneProps {
  onFileSelected: (file: File, fix: Fix | null) => void;
  disabled?: boolean;
}

type LocationStatus = "idle" | "capturing" | "captured" | "unavailable";

export function Dropzone({ onFileSelected, disabled }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lazy initializer, not a bare default — reads localStorage exactly once,
  // on mount, never re-derived from a prop (there's no prop to derive from
  // here, but same discipline as everywhere else in this app: read once,
  // then this is genuinely local UI state).
  const [tagLocation, setTagLocation] = useState(() => readLocationPreference());
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  const validateAndEmit = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!ALLOWED_MIME.has(file.type)) {
        setError("Unsupported file type — use PNG, JPEG, or WebP.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("File exceeds the 25MB limit.");
        return;
      }
      setError(null);

      let fix: Fix | null = null;
      if (tagLocation) {
        setLocationStatus("capturing");
        fix = await captureLocation();
        setLocationAccuracy(fix?.accuracy ?? null);
        setLocationStatus(fix ? "captured" : "unavailable");
      } else {
        setLocationStatus("idle");
      }

      onFileSelected(file, fix);
    },
    [onFileSelected, tagLocation],
  );

  function toggleTagLocation() {
    const next = !tagLocation;
    setTagLocation(next);
    writeLocationPreference(next);
    if (!next) {
      setLocationStatus("idle");
      setLocationAccuracy(null);
    }
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          validateAndEmit(e.dataTransfer.files?.[0]);
        }}
        onPaste={(e) => {
          if (disabled) return;
          const item = Array.from(e.clipboardData.items).find((i) =>
            i.type.startsWith("image/"),
          );
          const file = item?.getAsFile();
          if (file) validateAndEmit(file);
        }}
        className={cn(
          "group relative isolate grid cursor-pointer place-items-center overflow-hidden rounded-2xl px-8 py-20",
          "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
          disabled && "pointer-events-none opacity-45",
        )}
      >
        {/* Dashed rim that resolves into the spectrum on drag */}
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-2xl transition-opacity duration-500"
          style={{
            padding: 1,
            background: isDragging
              ? `linear-gradient(96deg, ${SPECTRUM_GRADIENT})`
              : "linear-gradient(160deg, oklch(1 0 0 / 0.16), oklch(1 0 0 / 0.04) 40%, oklch(1 0 0 / 0.1))",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 -z-20 rounded-2xl transition-colors duration-500",
            isDragging ? "bg-white/[0.045]" : "bg-white/[0.015] group-hover:bg-white/[0.03]",
          )}
        />

        <div className="flex flex-col items-center gap-5 text-center">
          <motion.div
            animate={
              reduce ? undefined : { y: isDragging ? -4 : 0, scale: isDragging ? 1.06 : 1 }
            }
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className="relative grid size-14 place-items-center rounded-full border border-white/10 bg-white/[0.03]"
          >
            <UploadCloud
              className="size-5 text-foreground/55 transition-colors duration-300 group-hover:text-foreground/85"
              aria-hidden
            />
            {isDragging && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(from 0deg, ${SPECTRUM_GRADIENT}, oklch(0.62 0.22 295))`,
                  opacity: 0.28,
                  filter: "blur(10px)",
                }}
              />
            )}
          </motion.div>

          <div className="space-y-1.5">
            <p
              className="text-[15px] tracking-tight"
              style={{ fontVariationSettings: '"wght" 500' }}
            >
              {isDragging ? "Release to analyze" : "Drop a design, paste, or click"}
            </p>
            {/* /55 not /38 — at 12.5px this must clear 4.5:1, and an app that
                flags contrast violations cannot ship one. */}
            <p className="text-[12.5px] text-foreground/55">
              PNG, JPEG, or WebP · up to 25MB
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={disabled}
          onChange={(e) => validateAndEmit(e.target.files?.[0])}
        />

        {/* A SEPARATE input, not `capture` added to the one above — putting
            `capture` on a file input that also needs to browse existing
            files removes the "choose from library" option on mobile
            browsers, which would break every existing upload flow. Shown
            only on touch devices (pointer-coarse:) — zero JS/UA-sniffing,
            and desktop has no camera to open anyway. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled}
          onChange={(e) => validateAndEmit(e.target.files?.[0])}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleTagLocation();
          }}
          disabled={disabled}
          aria-pressed={tagLocation}
          className={cn(
            "group/loc inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
            tagLocation
              ? "border-white/15 bg-white/[0.05] text-foreground/75"
              : "border-white/8 bg-transparent text-foreground/40",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <span
            aria-hidden
            className={cn("grid size-3.5 place-items-center rounded-full", tagLocation && "bg-white")}
          >
            <MapPin className={cn("size-2.5", tagLocation ? "text-black/70" : "text-foreground/45")} aria-hidden />
          </span>
          Tag location
          {locationStatus === "capturing" && <span className="text-foreground/45">— locating…</span>}
          {locationStatus === "captured" && locationAccuracy !== null && (
            <span className="text-foreground/45">
              — captured (±{locationAccuracy < 1000 ? `${Math.round(locationAccuracy)}m` : `${(locationAccuracy / 1000).toFixed(1)}km`})
            </span>
          )}
          {locationStatus === "unavailable" && <span className="text-foreground/45">— unavailable</span>}
        </button>

        {/* pointer-coarse: touch devices only — no desktop has a camera to open here. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) cameraInputRef.current?.click();
          }}
          disabled={disabled}
          className={cn(
            "hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11.5px] text-foreground/68 transition-colors hover:text-foreground/90 pointer-coarse:inline-flex",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <Camera className="size-3" aria-hidden />
          Take photo
        </button>
      </div>

      {tagLocation && (
        <p className="mt-2 text-[11px] leading-relaxed text-foreground/40">
          Coordinates are stored with the image and sent to OpenStreetMap to resolve a place name.
        </p>
      )}

      {error && (
        <motion.p
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center gap-2 text-[13px]"
          style={{ color: "oklch(0.72 0.19 18)" }}
          role="alert"
        >
          <AlertCircle className="size-3.5" aria-hidden />
          {error}
        </motion.p>
      )}
    </div>
  );
}
