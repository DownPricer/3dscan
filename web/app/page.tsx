import Link from "next/link";
import { CatalogStatus, ExternalListingStatus, PropertyStatus, VisitType } from "@prisma/client";
import { ArrowRight, Home, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

function visitTypeLabel(type: VisitType) {
  if (type === VisitType.MODEL_3D) return "3D";
  if (type === VisitType.PANORAMA_360) return "360";
  return "Hybride";
}

export const metadata = {
  title: "Catalogue — Visites virtuelles immobilières | Site Ready SHD",
  description: "Découvrez des biens disponibles avec visite virtuelle immersive.",
};

export default async function HomePage() {
  const properties = await prisma.property.findMany({
    where: {
      status: PropertyStatus.PUBLISHED,
      catalogEnabled: true,
      catalogStatus: CatalogStatus.ONLINE,
      NOT: { externalListingStatus: ExternalListingStatus.OFFLINE },
    },
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
    <main className="grain min-h-screen overflow-hidden bg-[#f7f5f0]">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-lg font-black tracking-tight text-[#0f2f3f]">
          Site Ready SHD
        </Link>
        <div className="flex items-center gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link href="/admin/login">Admin</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-10 pt-6 md:pb-14 md:pt-10">
        <div className="premium-card relative overflow-hidden rounded-[2.5rem] p-8 md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(47,111,94,.24),transparent_34rem)]" />
          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#2f6f5e]">
              Catalogue de biens en visite virtuelle
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-black tracking-tight text-[#0f2f3f] md:text-6xl">
              Découvrez des biens avec visite virtuelle immersive.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#475467] md:text-lg">
              Parcourez les annonces disponibles, puis lancez la visite 3D/360 pour vous projeter
              avant même le rendez-vous.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary">
                <a href="mailto:contact@sitereadyshd.com">
                  Vous voulez mettre votre maison en visite virtuelle ? <ArrowRight size={18} />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16">
        {properties.length === 0 ? (
          <Card className="bg-white">
            <h2 className="text-2xl font-black text-[#0f2f3f]">
              Aucune visite disponible pour le moment.
            </h2>
            <p className="mt-2 text-[#667085]">
              Vous êtes propriétaire ? Ajoutez une visite virtuelle 3D/360 à votre annonce et donnez
              plus envie aux acheteurs.
            </p>
            <div className="mt-6">
              <Button asChild>
                <a href="mailto:contact@sitereadyshd.com">
                  Mettre mon bien en ligne <ArrowRight size={18} />
                </a>
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => {
              const title = property.catalogTitle ?? property.name;
              const displayPrice = property.catalogPrice ?? property.price ?? null;
              const city = property.catalogCity ?? property.city ?? null;
              const postal = property.catalogPostalCode ?? property.postalCode ?? null;
              const location = [city, postal].filter(Boolean).join(" ");
              const cover = property.catalogCoverImageUrl ?? property.coverImageUrl ?? null;

              return (
                <Card key={property.id} className="bg-white p-0 overflow-hidden">
                  <div className="relative h-44 w-full overflow-hidden bg-[#0f2f3f]/5">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt={title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Home className="text-[#0f2f3f]/30" size={42} />
                      </div>
                    )}
                    <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                      <Badge>Visite virtuelle</Badge>
                      <Badge variant="published">{visitTypeLabel(property.visitType)}</Badge>
                    </div>
                  </div>

                  <div className="p-6">
                    <p className="text-2xl font-black text-[#0f2f3f]">
                      {displayPrice != null ? formatPrice(displayPrice) : "Prix sur demande"}
                    </p>
                    <h2 className="mt-2 text-lg font-bold text-[#0f2f3f]">{title}</h2>
                    {location ? (
                      <p className="mt-2 flex items-center gap-2 text-sm text-[#667085]">
                        <MapPin size={16} /> {location}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#475467]">
                      {property.catalogSurface ? <span>{property.catalogSurface} m²</span> : null}
                      {property.catalogRooms ? <span>{property.catalogRooms} pièces</span> : null}
                      {property.catalogBedrooms ? (
                        <span>{property.catalogBedrooms} ch.</span>
                      ) : null}
                    </div>

                    <div className="mt-6 grid gap-3">
                      <Button asChild>
                        <Link href={`/bien/${property.slug}`}>Voir le bien</Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href={`/visite/${property.slug}`}>Visite virtuelle</Link>
                      </Button>
                      {property.externalListingUrl ? (
                        <Button asChild variant="secondary">
                          <a href={property.externalListingUrl} target="_blank" rel="noreferrer">
                            Voir l’annonce Leboncoin
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
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
