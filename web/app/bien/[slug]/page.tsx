import Link from "next/link";
import { VisitType } from "@prisma/client";
import {
  BedDouble,
  Home,
  LayoutGrid,
  MapPin,
  Maximize2,
} from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/catalog/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readSessionToken } from "@/lib/auth";
import { sessionCookieName } from "@/lib/auth-constants";
import { isVisibleInCatalog } from "@/lib/catalog-visibility";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function visitTypeLabel(type: VisitType) {
  if (type === VisitType.MODEL_3D) return "3D";
  if (type === VisitType.PANORAMA_360) return "360";
  if (type === VisitType.MATTERPORT) return "Matterport";
  return "Hybride";
}

export async function generateMetadata({ params }: Props) {
  noStore();
  const { slug } = await params;
  const property = await prisma.property.findUnique({
    where: { slug },
    select: {
      name: true,
      catalogTitle: true,
      catalogDescription: true,
    },
  });

  if (!property) return { title: "Bien introuvable | Site Ready SHD" };

  const title = property.catalogTitle ?? property.name;
  const description =
    property.catalogDescription ?? `Découvrez ${title} avec visite virtuelle immersive.`;

  return { title: `${title} | Bien en visite virtuelle`, description };
}

export default async function BienDetailPage({ params }: Props) {
  noStore();
  const { slug } = await params;
  const property = await prisma.property.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      status: true,
      visitType: true,
      price: true,
      city: true,
      postalCode: true,
      description: true,
      coverImageUrl: true,
      catalogEnabled: true,
      catalogStatus: true,
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
      externalListingStatus: true,
    },
  });

  if (!property) notFound();

  const isPublic = isVisibleInCatalog(property);

  let isPreview = false;
  if (!isPublic) {
    const cookieStore = await cookies();
    const session = await readSessionToken(cookieStore.get(sessionCookieName)?.value);
    if (!session) notFound();
    isPreview = true;
  }

  const title = property.catalogTitle ?? property.name;
  const displayPrice = property.catalogPrice ?? property.price ?? null;
  const city = property.catalogCity ?? property.city ?? null;
  const postal = property.catalogPostalCode ?? property.postalCode ?? null;
  const location = [city, postal].filter(Boolean).join(" ");
  const cover = property.catalogCoverImageUrl ?? property.coverImageUrl ?? null;
  const bodyDescription =
    property.catalogDescription?.trim() ||
    property.description?.trim() ||
    "Description à venir.";

  return (
    <main className="min-h-screen bg-[#f7f5f0]">
      <SiteHeader />

      {isPreview ? (
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
            Prévisualisation admin — ce bien n&apos;est pas visible publiquement dans le catalogue.
          </div>
        </div>
      ) : null}

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="relative mt-6 aspect-[16/9] min-h-[240px] w-full overflow-hidden rounded-3xl bg-[#e8e4dc] sm:min-h-[420px]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#e8e4dc] to-[#d4cfc4]">
              <Home className="text-[#0f2f3f]/40" size={64} strokeWidth={1.5} />
              <span className="text-base font-medium text-[#475467]">Photo à venir</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <Badge variant="overlay">Visite virtuelle</Badge>
            <Badge variant="overlay">{visitTypeLabel(property.visitType)}</Badge>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px]">
          <div className="space-y-8">
            <div>
              <p className="text-4xl font-black tracking-tight text-[#0f2f3f] sm:text-5xl">
                {displayPrice != null ? formatPrice(displayPrice) : "Prix sur demande"}
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0f2f3f] sm:text-4xl">
                {title}
              </h1>
              {location ? (
                <p className="mt-3 flex items-center gap-2 text-base font-medium text-[#475467]">
                  <MapPin size={18} className="text-[#0f2f3f]" /> {location}
                </p>
              ) : null}
              {property.visitType === VisitType.MATTERPORT ? (
                <p className="mt-3 text-sm font-bold text-[#2f6f5e]">
                  Visite Matterport immersive disponible
                </p>
              ) : null}
            </div>

            <Card className="bg-white">
              <h2 className="text-lg font-black text-[#0f2f3f]">Caractéristiques</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {property.catalogSurface ? (
                  <div className="flex items-center gap-3 rounded-xl bg-[#f7f5f0] p-4">
                    <Maximize2 size={20} className="text-[#0f2f3f]" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#475467]">
                        Surface
                      </p>
                      <p className="text-lg font-bold text-[#0f2f3f]">
                        {property.catalogSurface} m²
                      </p>
                    </div>
                  </div>
                ) : null}
                {property.catalogRooms ? (
                  <div className="flex items-center gap-3 rounded-xl bg-[#f7f5f0] p-4">
                    <LayoutGrid size={20} className="text-[#0f2f3f]" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#475467]">
                        Pièces
                      </p>
                      <p className="text-lg font-bold text-[#0f2f3f]">{property.catalogRooms}</p>
                    </div>
                  </div>
                ) : null}
                {property.catalogBedrooms ? (
                  <div className="flex items-center gap-3 rounded-xl bg-[#f7f5f0] p-4">
                    <BedDouble size={20} className="text-[#0f2f3f]" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#475467]">
                        Chambres
                      </p>
                      <p className="text-lg font-bold text-[#0f2f3f]">
                        {property.catalogBedrooms}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="bg-white">
              <h2 className="text-lg font-black text-[#0f2f3f]">Description</h2>
              <p className="text-subtle mt-4 whitespace-pre-line text-base leading-8">
                {bodyDescription}
              </p>
            </Card>
          </div>

          <div className="lg:sticky lg:top-24 lg:self-start">
            <Card className="space-y-5 bg-white">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#475467]">
                  Prix
                </p>
                <p className="mt-1 text-3xl font-black text-[#0f2f3f]">
                  {displayPrice != null ? formatPrice(displayPrice) : "Sur demande"}
                </p>
              </div>

              <div className="grid gap-3">
                <Button asChild size="lg" className="w-full">
                  <Link href={`/visite/${property.slug}`}>Lancer la visite virtuelle</Link>
                </Button>
                {property.externalListingUrl ? (
                  <Button asChild variant="outline" className="w-full">
                    <a href={property.externalListingUrl} target="_blank" rel="noreferrer">
                      Voir l&apos;annonce Leboncoin
                    </a>
                  </Button>
                ) : null}
                <Button asChild variant="secondary" className="w-full">
                  <a href="mailto:contact@sitereadyshd.com">Nous contacter</a>
                </Button>
              </div>
            </Card>

            <Card className="mt-5 bg-[#f0ece4]">
              <h2 className="text-lg font-black text-[#0f2f3f]">
                Visite virtuelle pour votre bien ?
              </h2>
              <p className="text-muted mt-2 text-sm leading-relaxed">
                Ajoutez une visite virtuelle à votre annonce et démarquez votre bien.
              </p>
              <div className="mt-4">
                <Button asChild variant="outline" className="w-full">
                  <a href="mailto:contact@sitereadyshd.com">Demander un devis</a>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}
