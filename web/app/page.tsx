import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const steps = [
  {
    title: "On vient scanner le bien",
    text: "Un scan 3D précis est réalisé sur place avec un flux pensé pour les maisons et appartements à vendre.",
  },
  {
    title: "On met la visite 3D en ligne",
    text: "Le modèle est optimisé puis publié sur une page claire, rapide et compatible mobile.",
  },
  {
    title: "Vous partagez le lien",
    text: "Le propriétaire ou l'agent envoie une URL unique aux acheteurs potentiels.",
  },
];

const benefits = [
  "Réduction des visites inutiles",
  "Expérience premium pour les acheteurs",
  "Lien consultable sur mobile, tablette et ordinateur",
  "Page publique unique pour chaque propriété",
];

const faqs = [
  {
    q: "Quel format 3D est recommandé ?",
    a: "Le format GLB est conseillé pour un affichage web fiable, léger et simple à partager.",
  },
  {
    q: "Les visites fonctionnent-elles sur téléphone ?",
    a: "Oui, le viewer est tactile et responsive pour mobile, tablette et ordinateur.",
  },
  {
    q: "Peut-on garder une visite en brouillon ?",
    a: "Oui, l'admin peut préparer une propriété en brouillon avant publication.",
  },
];

export default function HomePage() {
  return (
    <main className="grain min-h-screen overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-lg font-black tracking-tight text-[#0f2f3f]">
          Site Ready SHD
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-[#475467] md:flex">
          <a href="#fonctionnement">Fonctionnement</a>
          <a href="#tarifs">Tarifs</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin/login">Admin</Link>
        </Button>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-12 md:grid-cols-[1.05fr_.95fr] md:items-center md:pt-20">
        <div className="relative z-10">
          <div className="mb-5 inline-flex rounded-full border border-[#0f2f3f]/10 bg-white/70 px-4 py-2 text-sm font-semibold text-[#2f6f5e]">
            Visites virtuelles 3D pour l'immobilier
          </div>
          <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-[-0.04em] text-[#0f2f3f] md:text-7xl">
            Faites visiter un bien avant même le premier rendez-vous.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#475467]">
            Site Ready SHD scanne en 3D maisons et appartements à vendre, puis
            publie une visite virtuelle partageable avec vos acheteurs depuis
            leur téléphone ou ordinateur.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href="mailto:contact@sitereadyshd.com">
                Demander une visite 3D <ArrowRight size={18} />
              </a>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href="#fonctionnement">Voir le fonctionnement</a>
            </Button>
          </div>
        </div>

        <div className="premium-card relative min-h-[430px] overflow-hidden rounded-[2.5rem] p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(47,111,94,.28),transparent_24rem)]" />
          <div className="relative flex h-full flex-col justify-between rounded-[2rem] bg-[#0f2f3f] p-6 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/12 px-4 py-2 text-sm">Visite immersive</span>
              <Sparkles className="text-[#a7d7c5]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-28 rounded-3xl bg-white/10" />
              <div className="h-28 rounded-3xl bg-[#a7d7c5]/30" />
              <div className="col-span-2 h-40 rounded-3xl border border-white/15 bg-white/10 p-4">
                <div className="h-full rounded-2xl border border-dashed border-white/25 bg-black/10" />
              </div>
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/60">Lien public</p>
              <p className="mt-2 break-all text-lg font-semibold">
                visite-virtuelle.sitereadyshd.com/villa-cote-jardin
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="fonctionnement" className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-10 max-w-2xl">
          <p className="font-semibold text-[#2f6f5e]">Simple pour vous</p>
          <h2 className="mt-2 text-4xl font-black tracking-tight text-[#0f2f3f]">
            Une visite en ligne en trois étapes.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <Card key={step.title}>
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0f2f3f] text-lg font-bold text-white">
                {index + 1}
              </div>
              <CardTitle>{step.title}</CardTitle>
              <CardDescription className="mt-3 leading-6">{step.text}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-16 md:grid-cols-2">
        <div>
          <p className="font-semibold text-[#2f6f5e]">Avantages</p>
          <h2 className="mt-2 text-4xl font-black tracking-tight text-[#0f2f3f]">
            Une expérience plus efficace pour vendre.
          </h2>
        </div>
        <div className="grid gap-4">
          {benefits.map((benefit) => (
            <div key={benefit} className="flex items-center gap-3 rounded-3xl bg-white/70 p-4">
              <ShieldCheck className="text-[#2f6f5e]" />
              <span className="font-semibold text-[#17252f]">{benefit}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="tarifs" className="mx-auto max-w-7xl px-6 py-16">
        <div className="premium-card rounded-[2.5rem] p-8 md:p-10">
          <p className="font-semibold text-[#2f6f5e]">Tarifs</p>
          <h2 className="mt-2 text-4xl font-black tracking-tight text-[#0f2f3f]">
            Offres ajustables selon la surface et la zone.
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {["Appartement", "Maison", "Agence"].map((plan) => (
              <Card key={plan} className="bg-white">
                <CardTitle>{plan}</CardTitle>
                <p className="mt-4 text-3xl font-black text-[#0f2f3f]">Sur devis</p>
                <CardDescription className="mt-3">
                  Placeholder modifiable depuis le code ou une future table de configuration.
                </CardDescription>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-4xl font-black tracking-tight text-[#0f2f3f]">FAQ</h2>
        <div className="mt-8 space-y-4">
          {faqs.map((faq) => (
            <Card key={faq.q} className="bg-white/80">
              <CardTitle>{faq.q}</CardTitle>
              <CardDescription className="mt-2 leading-6">{faq.a}</CardDescription>
            </Card>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-[#667085] md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Site Ready SHD. Visites virtuelles immobilières.</p>
        <div className="flex gap-5">
          <Link href="/admin/login">Admin</Link>
          <a href="mailto:contact@sitereadyshd.com">Contact</a>
        </div>
      </footer>
    </main>
  );
}
