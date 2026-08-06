import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";

export const metadata = { title: "Sign in — Opacitys" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      lede="Pick up wherever you left off — half-finished counts."
      footer="Your work is saved to your Google account and follows you anywhere you sign in."
    >
      {/* GoogleButton reads ?next= via useSearchParams, which Next requires a
          Suspense boundary for on an otherwise-static page. */}
      <Suspense fallback={null}>
        <GoogleButton />
      </Suspense>
    </AuthShell>
  );
}
