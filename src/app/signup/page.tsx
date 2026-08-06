import { redirect } from "next/navigation";

// There's only one door now — Google sign-in creates an account on first use,
// same as it signs one in on every use after. No separate signup flow needed.
export default function SignupPage() {
  redirect("/login");
}
