"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Word-by-word blur-to-sharp reveal for headings, triggered once when
 * scrolled into view. Splits on spaces only — inline markup (e.g. a coloured
 * <span>) is kept as one unit rather than torn apart word-by-word.
 */
export function ScrollReveal({
  children,
  className,
  as: Tag = "span",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "h1" | "h2" | "h3" | "p";
  delay?: number;
}) {
  const reduce = useReducedMotion();

  const parts = Children.toArray(children).flatMap((child) =>
    typeof child === "string"
      ? child.split(/(\s+)/).filter((w) => w.length > 0)
      : [child],
  );

  if (reduce) {
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Tag className={className}>
      <motion.span
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-70px" }}
        transition={{ staggerChildren: 0.032, delayChildren: delay }}
        style={{ display: "inline" }}
      >
        {parts.map((part, i) =>
          typeof part === "string" ? (
            part.trim() === "" ? (
              part
            ) : (
              <motion.span
                key={i}
                variants={{
                  hidden: { opacity: 0, filter: "blur(9px)", y: 10 },
                  visible: { opacity: 1, filter: "blur(0px)", y: 0 },
                }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: "inline-block" }}
              >
                {part}
              </motion.span>
            )
          ) : isValidElement(part) ? (
            part
          ) : null,
        )}
      </motion.span>
    </Tag>
  );
}
