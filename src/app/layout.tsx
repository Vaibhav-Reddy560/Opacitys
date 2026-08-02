import type { Metadata } from "next";
import { chillax, nemesis } from "@/lib/fonts";
import { CustomCursor } from "@/components/visual/custom-cursor";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opacitys — Measurement-grounded design critique",
  description:
    "Upload a design and get every flaw pinpointed on the image, backed by a measured number instead of an adjective.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${chillax.variable} ${nemesis.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
        <CustomCursor />
      </body>
    </html>
  );
}
