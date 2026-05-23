"use server";

import {
  createSessionToken,
  persistSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type LoginState = {
  error: string | null;
  /** Présent après succès — le client fait window.location (redirect() incompatible avec useActionState). */
  redirectTo?: string;
};

function safeRedirectPath(next: string) {
  if (next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/admin";
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(String(formData.get("next") ?? "/admin"));

  console.log("[auth] login attempt", { email, redirectTarget: next });

  if (!email || !password) {
    console.log("[auth] login failed: champs manquants");
    return { error: "Email et mot de passe obligatoires." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      console.log("[auth] login failed: identifiants incorrects", { email });
      return { error: "Identifiants incorrects." };
    }

    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const cookieMeta = await persistSessionCookie(token);

    console.log("[auth] login success", {
      email,
      redirectTarget: next,
      cookieSet: cookieMeta.set,
      cookieSecure: cookieMeta.secure,
    });

    return { error: null, redirectTo: next };
  } catch (error) {
    console.error("[auth] login error", error);
    return { error: "Connexion impossible. Réessayez." };
  }
}
