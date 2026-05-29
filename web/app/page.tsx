import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { CatalogList } from "@/components/catalog/catalog-list";
import { SiteHeader } from "@/components/catalog/site-header";
import { Button } from "@/components/ui/button";
import { catalogVisibilityWhere } from "@/lib/catalog-visibility";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Catalogue — Visites virtuelles immobilières | Site Ready SHD",
  description: "Découvrez des biens disponibles avec visite virtuelle immersive.",
};

export default async function HomePage() {
  noStore();
  const properties = await prisma.property.findMany({
    where: catalogVisibilityWhere,
    orderBy: [{ catalogSortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      postalCode: true,
      price: true,
      visitType: true,
      coverImageUrl: true,
      catalogTitle: true,
      catalogDescription: true,
      catalogPrice: true,
      catalogCity: true,
      catalogPostalCode: true,
      catalogSurface: true,
      catalogRooms: true,
      catalogBedrooms: true,
      catalogCoverImageUrl: true,
      externalListingUrl: true,
    },
  });

  return (
    <main className="min-h-screen bg-[#f7f5f0]">
      <SiteHeader />

      <section className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 sm:pt-12">
        <div className="rounded-3xl border border-[#0f2f3f]/10 bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-12">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#2f6f5e]">
            Portail immobilier
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight text-[#0f2f3f] sm:text-5xl">
            Visites virtuelles immobilières
          </h1>
          <p className="text-muted mt-4 max-w-2xl text-base leading-7 sm:text-lg">
            Explorez des biens en 3D, 360° ou Matterport local. Parcourez les annonces, puis
            lancez la visite immersive avant votre rendez-vous.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <a href="mailto:contact@sitereadyshd.com">
                Mettre mon bien en visite virtuelle <ArrowRight size={18} />
              </a>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 sm:pb-16">
        <CatalogList properties={properties} />
      </section>

      <section className="border-t border-[#0f2f3f]/10 bg-[#f0ece4]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-10 sm:flex-row sm:items-center sm:px-6 sm:py-12">
          <div className="max-w-xl">
            <h2 className="text-2xl font-black text-[#0f2f3f]">
              Vous voulez mettre votre maison en ligne ?
            </h2>
            <p className="text-muted mt-2 text-base leading-relaxed">
              Ajoutez une visite virtuelle à votre annonce et démarquez votre bien.
            </p>
          </div>
          <Button asChild size="lg" variant="outline">
            <a href="mailto:contact@sitereadyshd.com">
              Nous contacter <ArrowRight size={18} />
            </a>
          </Button>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-[#475467] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} Site Ready SHD. Visites virtuelles immobilières.</p>
        <div className="flex gap-5 font-medium">
          <Link href="/admin/login" className="hover:text-[#0f2f3f]">
            Admin
          </Link>
          <a href="mailto:contact@sitereadyshd.com" className="hover:text-[#0f2f3f]">
            Contact
          </a>
        </div>
      </footer>
    </main>
  );
}
