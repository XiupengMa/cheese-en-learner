import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic redirect wall: checks only that a session cookie exists (no DB
// call — this runs on every matched request, including prefetches). The API
// routes do the real session verification via lib/session.ts.
export default function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const onLoginPage = request.nextUrl.pathname === "/login";

  if (!sessionCookie && !onLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (sessionCookie && onLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they enforce auth themselves and
  // /api/auth must stay reachable), Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.svg$).*)"],
};
