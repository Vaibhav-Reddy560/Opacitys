"use client";

import { useCallback, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { UploadCloud, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPECTRUM_GRADIENT } from "@/lib/critique/spectrum";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 25 * 1024 * 1024;

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function Dropzone({ onFileSelected, disabled }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  const validateAndEmit = useCallback(
    (file: File | undefined) => {
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
      onFileSelected(file);
    },
    [onFileSelected],
  );

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
      </div>

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
