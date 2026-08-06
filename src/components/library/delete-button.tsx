"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A real delete, not a soft flag — confirms once (browser confirm(), no
 * custom modal needed for a single destructive action), calls the route,
 * then router.refresh() so the server-rendered list drops the row without
 * a full reload.
 */
export function DeleteButton({
  url,
  confirmMessage,
  className,
  label,
}: {
  url: string;
  confirmMessage: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await fetch(url, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      title="Delete"
      className={cn(
        "inline-flex items-center gap-1.5 text-foreground/40 transition-colors hover:text-[oklch(0.72_0.19_18)] disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
      {label}
    </button>
  );
}
