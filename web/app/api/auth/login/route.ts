import { NextResponse } from "next/server";
import {
  createSessionToken,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  let email = "";
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    email = body.email?.toLowerCase().trim() ?? "";
    const password = body.password ?? "";

    console.log("[auth] API login attempt", { email });

    if (!email || !password) {
      console.log("[auth] API login failed: champs manquants");
      return NextResponse.json(
        { error: "Email et mot de passe obligatoires." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      console.log("[auth] API login failed: identifiants incorrects", { email });
      return NextResponse.json(
        { error: "Identifiants incorrects." },
        { status: 401 },
      );
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const response = NextResponse.json({ ok: true, redirect: "/admin" });
    setSessionCookie(response, token, request);

    console.log("[auth] API login success", { email, redirect: "/admin" });
    return response;
  } catch (error) {
    console.error("[auth] API login error", { email, error });
    return NextResponse.json(
      { error: "Connexion impossible." },
      { status: 500 },
    );
  }
}
