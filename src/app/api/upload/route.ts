import { NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { reverseGeocode } from "@/lib/geo/reverse";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

const querySchema = z.object({
  projectId: z.string().uuid().optional(),
  // Read client-side via the browser Image API before upload — avoids
  // pulling in a server-side image-decoding dependency for Phase 0.
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  // The File's own .name, purely for display in the library grid — never
  // used for the storage path (that's always a nanoid) or any lookup.
  filename: z.string().max(255).optional(),
  // Read client-side via the browser's Geolocation API (src/lib/geo/capture.ts)
  // right before upload — where the uploader WAS, not EXIF. Absent whenever
  // the toggle was off, permission was denied, or the browser doesn't
  // support it; a missing fix is a normal upload, not an error.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().nonnegative().optional(),
});

// POST /api/upload?projectId=...&width=...&height=...&filename=...&lat=...&lng=...&accuracy=...
// (body: raw file bytes, Content-Type set to the image mime type). The
// uploader is always the signed-in session, never a client-supplied id —
// the old version took userId as a query param, which meant anyone could
// upload and attribute an asset to any account by just changing the value
// in the URL.
export async function POST(req: Request) {
  const { session, error } = await requireUser();
  if (error) return error;

  const url = new URL(req.url);
  const parsedQuery = querySchema.safeParse({
    projectId: url.searchParams.get("projectId") ?? undefined,
    width: url.searchParams.get("width") ?? undefined,
    height: url.searchParams.get("height") ?? undefined,
    filename: url.searchParams.get("filename") ?? undefined,
    lat: url.searchParams.get("lat") ?? undefined,
    lng: url.searchParams.get("lng") ?? undefined,
    accuracy: url.searchParams.get("accuracy") ?? undefined,
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

  const { lat, lng, accuracy } = parsedQuery.data;

  const [asset] = await db
    .insert(schema.assets)
    .values({
      userId: session.userId,
      projectId: parsedQuery.data.projectId ?? null,
      storageKey: blob.url,
      originalName: parsedQuery.data.filename ?? null,
      mime,
      width: parsedQuery.data.width ?? null,
      height: parsedQuery.data.height ?? null,
      latitude: lat ?? null,
      longitude: lng ?? null,
      locationAccuracy: accuracy ?? null,
    })
    .returning({ id: schema.assets.id });

  // Reverse-geocode AFTER the response goes out, same "don't make the user
  // wait on non-essential work" pattern as every pipeline's after() in this
  // app. The map draws from lat/lng, written synchronously above; this only
  // fills in the cosmetic place label, and can lag or fail silently.
  if (lat !== undefined && lng !== undefined) {
    after(async () => {
      const label = await reverseGeocode(lat, lng);
      if (label) {
        await db.update(schema.assets).set({ placeLabel: label }).where(eq(schema.assets.id, asset.id));
      }
    });
  }

  return NextResponse.json({ assetId: asset.id, url: blob.url }, { status: 201 });
}
