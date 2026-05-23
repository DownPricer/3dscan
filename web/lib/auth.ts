import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth-constants";
import { getRequiredAuthSecret } from "@/lib/env";
import { prisma } from "@/lib/prisma";

type SessionPayload = {
  sub: string;
  email: string;
  role: "ADMIN";
};

function getSecretKey() {
  return new TextEncoder().encode(getRequiredAuthSecret());
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function readSessionToken(token?: string) {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.role !== "ADMIN" || typeof payload.sub !== "string") return null;

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentAdmin() {
  const cookieStore = await cookies();
  const session = await readSessionToken(cookieStore.get(sessionCookieName)?.value);

  if (!session) return null;

  return prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true, createdAt: true },
  });
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return admin;
}

export async function requireAdminRequest(request: NextRequest) {
  const session = await readSessionToken(
    request.cookies.get(sessionCookieName)?.value,
  );

  if (!session) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true },
  });
}

/** Cookie Secure : HTTPS via NEXT_PUBLIC_APP_URL ou X-Forwarded-Proto (Nginx). */
export function cookieSecureFlag(request?: Request) {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;

  const forwarded = request?.headers.get("x-forwarded-proto");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() === "https";
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return appUrl.startsWith("https://");
}

export function sessionCookieOptions(request?: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecureFlag(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

function requestFromForwardedHeaders(forwardedProto: string | null) {
  if (!forwardedProto) return undefined;
  return new Request("http://session.local", {
    headers: { "x-forwarded-proto": forwardedProto },
  });
}

export async function persistSessionCookie(token: string, request?: Request) {
  const headersList = await headers();
  const forwardedProto = headersList.get("x-forwarded-proto");
  const effectiveRequest = request ?? requestFromForwardedHeaders(forwardedProto);
  const options = sessionCookieOptions(effectiveRequest);

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, options);

  console.log("[auth] cookie set", {
    name: sessionCookieName,
    secure: options.secure,
    path: options.path,
    forwardedProto,
  });

  return { set: true, secure: options.secure, path: options.path };
}

export function setSessionCookie(response: NextResponse, token: string, request?: Request) {
  response.cookies.set(sessionCookieName, token, sessionCookieOptions(request));
}

export function clearSessionCookie(response: NextResponse, request?: Request) {
  response.cookies.set(sessionCookieName, "", {
    ...sessionCookieOptions(request),
    maxAge: 0,
  });
}
