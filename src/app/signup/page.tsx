import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata = { title: "Create an account — Opacitys" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Start at ten percent"
      lede="Bring in one design and the studio starts learning how you work."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground/85 underline-offset-4 transition-colors hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      {/* AuthForm reads ?next= via useSearchParams, which Next requires a
          Suspense boundary for on an otherwise-static page. */}
      <Suspense fallback={null}>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
