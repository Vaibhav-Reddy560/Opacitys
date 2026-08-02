// Next.js 16 renamed Middleware to Proxy (same runtime, same purpose) — see
// node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md. This is
// the optimistic half of the auth gate: it only verifies the session
// cookie's signature, never touches the database, and exists to redirect
// obviously-unauthenticated visits before they render — not to be the sole
// authorization check. Anything that actually reads or writes user data
// (the Server Actions in src/lib/auth/actions.ts) verifies again itself.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth/token";

const STUDIO_PREFIX = "/studio";
const AUTH_ROUTES = new Set(["/login", "/signup"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = verifyToken(req.cookies.get(SESSION_COOKIE)?.value);

  const isStudioRoute = pathname === STUDIO_PREFIX || pathname.startsWith(`${STUDIO_PREFIX}/`);
  if (isStudioRoute && !session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (AUTH_ROUTES.has(pathname) && session) {
    return NextResponse.redirect(new URL(STUDIO_PREFIX, req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skips API routes, Next's own asset pipeline, and anything that already
  // looks like a static file (favicon, fonts, images) — none of those are
  // ever behind the studio gate, so there's no reason to pay the cookie
  // verification cost on them.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|ttf|otf|woff|woff2)$).*)",
  ],
};
