import { NextResponse } from "next/server";
import {
  createSessionToken,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email et mot de passe obligatoires." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Identifiants invalides." },
      { status: 401 },
    );
  }

  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, token);

  return response;
}
