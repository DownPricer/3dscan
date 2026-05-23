import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth-constants";

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName)?.value;
  const secret = process.env.AUTH_SECRET;

  if (!token || !secret) return false;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return payload.role === "ADMIN" && typeof payload.sub === "string";
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  if (
    host.startsWith("visite-virtuelle.") &&
    pathname !== "/" &&
    !pathname.startsWith("/visite") &&
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next") &&
    !pathname.includes(".")
  ) {
    return NextResponse.rewrite(new URL(`/visite${pathname}`, request.url));
  }

  if (pathname === "/admin/login") {
    if (await hasValidSession(request)) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!(await hasValidSession(request))) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Exclure /api : le middleware tronque sinon les corps multipart (upload 3D > 16 Ko).
  matcher: [
    "/admin/:path*",
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
