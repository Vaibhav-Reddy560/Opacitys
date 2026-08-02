import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Sign in — Opacitys" };

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      lede="Pick up wherever you left off — half-finished counts."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="text-foreground/85 underline-offset-4 transition-colors hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {/* AuthForm reads ?next= via useSearchParams, which Next requires a
          Suspense boundary for on an otherwise-static page. */}
      <Suspense fallback={null}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
