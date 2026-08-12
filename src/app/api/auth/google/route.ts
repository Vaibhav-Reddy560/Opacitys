import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { verifyFirebaseIdToken } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({ idToken: z.string().min(1) });

// POST /api/auth/google { idToken } -> verifies the Firebase ID token,
// upserts a `users` row, and mints our own HMAC session cookie exactly like
// the old signIn/signUp actions did. Firebase only ever authenticates the
// request; every other route in the app still reads OUR cookie via
// readSession(), untouched.
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing idToken." }, { status: 400 });
  }

  let decoded;
  try {
    decoded = await verifyFirebaseIdToken(parsed.data.idToken);
  } catch {
    return NextResponse.json({ error: "That sign-in could not be verified. Try again." }, { status: 401 });
  }

  const email = decoded.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Your Google account has no email to sign in with." }, { status: 400 });
  }
  // Google-provider tokens always carry email_verified: true, but this is
  // the gate that makes the link-by-email adoption below safe to do at all —
  // without it, an unverified email claim could hijack an existing account.
  if (!decoded.email_verified) {
    return NextResponse.json({ error: "That Google account's email is not verified." }, { status: 401 });
  }

  const name = typeof decoded.name === "string" ? decoded.name : null;
  const image = typeof decoded.picture === "string" ? decoded.picture : null;

  let userId: string;
  try {
    const [byUid] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.firebaseUid, decoded.uid))
      .limit(1);

    if (byUid) {
      userId = byUid.id;
      await db.update(schema.users).set({ name, image }).where(eq(schema.users.id, userId));
    } else {
      // Link-by-email: an existing pre-Firebase row is adopted rather than
      // duplicated, so its uploads/critiques/reads carry over. Google has
      // already verified this email (email_verified is part of what
      // verifyIdToken checks for a Google-provider token), so trusting the
      // match here doesn't hand an account to someone who merely typed a
      // matching address.
      const [byEmail] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);

      if (byEmail) {
        userId = byEmail.id;
        await db
          .update(schema.users)
          .set({ firebaseUid: decoded.uid, name, image })
          .where(eq(schema.users.id, userId));
      } else {
        const [created] = await db
          .insert(schema.users)
          .values({ email, firebaseUid: decoded.uid, name, image })
          .returning({ id: schema.users.id });
        userId = created.id;
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? `Could not sign in: ${err.message}` : "Could not sign in." },
      { status: 502 },
    );
  }

  await createSession(userId, "user", { name, email, image });
  return NextResponse.json({ ok: true });
}
