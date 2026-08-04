import { notFound } from "next/navigation";
import { WordmarkLab } from "./wordmark-lab";

// Tuning ground for the dispersive-glass wordmark (WordmarkGlass). Not part
// of the product — dev-only, so it never ships in production, and never
// linked from anywhere in the app.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <WordmarkLab />;
}
