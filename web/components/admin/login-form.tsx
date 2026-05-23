"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { loginAction, type LoginState } from "@/app/admin/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = { error: null };

function LoginFormContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin";
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={pending}
        />
      </div>
      {state.error ? (
        <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Connexion..." : "Se connecter"}
      </Button>
    </form>
  );
}

function LoginFormFallback() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Chargement du formulaire">
      <div className="space-y-2">
        <div className="h-4 w-12 rounded bg-[#e8f0ed]" />
        <div className="h-10 w-full rounded-2xl bg-[#e8f0ed]" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-24 rounded bg-[#e8f0ed]" />
        <div className="h-10 w-full rounded-2xl bg-[#e8f0ed]" />
      </div>
      <div className="h-11 w-full rounded-2xl bg-[#d4e5df]" />
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginFormContent />
    </Suspense>
  );
}
