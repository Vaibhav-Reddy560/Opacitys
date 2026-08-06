import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { encryptToken, decryptToken, hasPortfolioTokenKey } from "@/lib/crypto";

/**
 * Dribbble is the only portfolio platform this app can actually connect.
 * Behance's public developer API is closed — Adobe shut it to new
 * integrations, so there is no OAuth flow to build against it at all, ever
 * (see designerProfiles.portfolioLinks for how Behance is handled instead:
 * a plain link).
 *
 * All three env vars below are independently optional. Any one missing
 * degrades this to "not connected" rather than a page error — same pattern
 * as the GROQ_API_KEY guards on every AI route.
 */

const AUTHORIZE_URL = "https://dribbble.com/oauth/authorize";
const TOKEN_URL = "https://dribbble.com/oauth/token";
const API_BASE = "https://api.dribbble.com/v2";
const PROVIDER = "dribbble";

export function dribbbleConfigured(): boolean {
  return Boolean(process.env.DRIBBBLE_CLIENT_ID && process.env.DRIBBBLE_CLIENT_SECRET) && hasPortfolioTokenKey();
}

export function dribbbleUnavailableReason(): string | null {
  if (!process.env.DRIBBBLE_CLIENT_ID || !process.env.DRIBBBLE_CLIENT_SECRET) {
    return "Dribbble isn't configured on this deployment — DRIBBBLE_CLIENT_ID/SECRET aren't set.";
  }
  if (!hasPortfolioTokenKey()) {
    return "Dribbble isn't configured on this deployment — PORTFOLIO_TOKEN_KEY isn't set.";
  }
  return null;
}

function redirectUri(origin: string): string {
  return `${origin}/api/portfolio/dribbble/callback`;
}

/** The URL to send the user to. `state` should be an unguessable, per-request value the callback verifies. */
export function buildAuthorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.DRIBBBLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    scope: "public",
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  scope: z.string(),
});

export async function exchangeCodeForToken(code: string, origin: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.DRIBBBLE_CLIENT_ID,
      client_secret: process.env.DRIBBBLE_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(origin),
    }),
  });
  if (!res.ok) throw new Error(`Dribbble token exchange failed (${res.status}).`);
  const { access_token } = tokenResponseSchema.parse(await res.json());
  return access_token;
}

const userResponseSchema = z.object({ login: z.string() });

export async function fetchDribbbleHandle(accessToken: string): Promise<string> {
  const res = await fetch(`${API_BASE}/user`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Could not read the Dribbble account (${res.status}).`);
  const { login } = userResponseSchema.parse(await res.json());
  return login;
}

export interface DribbbleShot {
  id: string;
  title: string;
  url: string;
  imageUrl: string;
  publishedAt: string;
}

// v2's own shot shape — deliberately NOT asserting views_count/likes_count
// exist: v1 had them, v2 dropped them, and asserting on absent fields would
// just throw. See the schema.ts comment on portfolioMetrics for why nothing
// here tries to backfill that data from anywhere else.
const shotSchema = z.object({
  id: z.number(),
  title: z.string(),
  html_url: z.string(),
  published_at: z.string(),
  images: z.object({ normal: z.string().nullish(), teaser: z.string().nullish() }),
});
const shotsResponseSchema = z.array(shotSchema);

export async function fetchDribbbleShots(accessToken: string, perPage = 24): Promise<DribbbleShot[]> {
  const res = await fetch(`${API_BASE}/user/shots?per_page=${perPage}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Could not fetch shots from Dribbble (${res.status}).`);
  const shots = shotsResponseSchema.parse(await res.json());

  return shots.map((s) => ({
    id: String(s.id),
    title: s.title,
    url: s.html_url,
    imageUrl: s.images.normal ?? s.images.teaser ?? "",
    publishedAt: s.published_at,
  }));
}

export interface DribbbleConnection {
  id: string;
  externalHandle: string | null;
  shots: DribbbleShot[];
  lastSync: Date | null;
}

export async function getDribbbleConnection(userId: string): Promise<DribbbleConnection | null> {
  const [row] = await db
    .select({
      id: schema.portfolioConnections.id,
      externalHandle: schema.portfolioConnections.externalHandle,
      shots: schema.portfolioConnections.shots,
      lastSync: schema.portfolioConnections.lastSync,
    })
    .from(schema.portfolioConnections)
    .where(and(eq(schema.portfolioConnections.userId, userId), eq(schema.portfolioConnections.provider, PROVIDER)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    externalHandle: row.externalHandle,
    shots: Array.isArray(row.shots) ? (row.shots as DribbbleShot[]) : [],
    lastSync: row.lastSync,
  };
}

/** Upsert-by-(userId, provider) — one Dribbble connection per user, same shape as designerProfiles' PK-on-userId. */
export async function saveDribbbleConnection(params: {
  userId: string;
  accessToken: string;
  externalHandle: string;
}): Promise<void> {
  const existing = await db
    .select({ id: schema.portfolioConnections.id })
    .from(schema.portfolioConnections)
    .where(and(eq(schema.portfolioConnections.userId, params.userId), eq(schema.portfolioConnections.provider, PROVIDER)))
    .limit(1);

  const oauthTokenEnc = encryptToken(params.accessToken);

  if (existing[0]) {
    await db
      .update(schema.portfolioConnections)
      .set({ oauthTokenEnc, externalHandle: params.externalHandle })
      .where(eq(schema.portfolioConnections.id, existing[0].id));
  } else {
    await db.insert(schema.portfolioConnections).values({
      userId: params.userId,
      provider: PROVIDER,
      oauthTokenEnc,
      externalHandle: params.externalHandle,
    });
  }
}

export async function syncDribbbleShots(userId: string): Promise<{ shots: number }> {
  const [row] = await db
    .select({ id: schema.portfolioConnections.id, oauthTokenEnc: schema.portfolioConnections.oauthTokenEnc })
    .from(schema.portfolioConnections)
    .where(and(eq(schema.portfolioConnections.userId, userId), eq(schema.portfolioConnections.provider, PROVIDER)))
    .limit(1);
  if (!row) throw new Error("No Dribbble connection to sync.");

  const accessToken = decryptToken(row.oauthTokenEnc);
  const shots = await fetchDribbbleShots(accessToken);

  await db
    .update(schema.portfolioConnections)
    .set({ shots, lastSync: new Date() })
    .where(eq(schema.portfolioConnections.id, row.id));

  return { shots: shots.length };
}

export async function disconnectDribbble(userId: string): Promise<void> {
  await db
    .delete(schema.portfolioConnections)
    .where(and(eq(schema.portfolioConnections.userId, userId), eq(schema.portfolioConnections.provider, PROVIDER)));
}
