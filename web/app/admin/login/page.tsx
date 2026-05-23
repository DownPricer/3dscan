import Link from "next/link";
import { LoginForm } from "@/components/admin/login-form";
import { Card } from "@/components/ui/card";

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md bg-white/85">
        <Link href="/" className="text-sm font-semibold text-[#2f6f5e]">
          ← Retour au site
        </Link>
        <div className="mb-8 mt-6">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#2f6f5e]">
            Admin sécurisé
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#0f2f3f]">
            Connexion Site Ready SHD
          </h1>
          <p className="mt-2 text-sm text-[#667085]">
            Connectez-vous pour créer, publier et partager vos visites 3D.
          </p>
        </div>
        <LoginForm />
      </Card>
    </main>
  );
}
