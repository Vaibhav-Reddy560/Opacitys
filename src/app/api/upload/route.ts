import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { readSession } from "@/lib/auth/session";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

const querySchema = z.object({
  projectId: z.string().uuid().optional(),
  // Read client-side via the browser Image API before upload — avoids
  // pulling in a server-side image-decoding dependency for Phase 0.
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
});

// POST /api/upload?projectId=...&width=...&height=...  (body: raw file
// bytes, Content-Type set to the image mime type). The uploader is always
// the signed-in session, never a client-supplied id — the old version took
// userId as a query param, which meant anyone could upload and attribute
// an asset to any account by just changing the value in the URL.
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to upload a design." }, { status: 401 });
  }
  if (session.kind === "guest") {
    return NextResponse.json(
      { error: "Guest sessions aren't saved — create an account to run this." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    projectId: url.searchParams.get("projectId") ?? undefined,
    width: url.searchParams.get("width") ?? undefined,
    height: url.searchParams.get("height") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }

  const mime = req.headers.get("content-type") ?? "";
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported content-type: ${mime}. Allowed: png, jpeg, webp.` },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload body" }, { status: 400 });
  }
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 413 });
  }

  const ext = mime.split("/")[1];
  const storageKey = `assets/${session.userId}/${nanoid()}.${ext}`;

  // `public` here means "unauthenticated fetch of this exact URL", not
  // "listed/discoverable" — Vercel Blob URLs are unguessable. Public access
  // is required in practice: the measurement pass and the Groq vision calls
  // all fetch the image by URL and can't present our app's auth. If
  // stricter access is needed later, switch to `private` and proxy bytes
  // through a server route instead of passing the URL through.
  const blob = await put(storageKey, buffer, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });

  const [asset] = await db
    .insert(schema.assets)
    .values({
      userId: session.userId,
      projectId: parsedQuery.data.projectId ?? null,
      storageKey: blob.url,
      mime,
      width: parsedQuery.data.width ?? null,
      height: parsedQuery.data.height ?? null,
    })
    .returning({ id: schema.assets.id });

  return NextResponse.json({ assetId: asset.id, url: blob.url }, { status: 201 });
}
