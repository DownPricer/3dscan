import Link from "next/link";
import { CatalogStatus, ExternalListingStatus, PropertyStatus, VisitType } from "@prisma/client";
import { Home, MapPin } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readSessionToken } from "@/lib/auth";
import { sessionCookieName } from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

type Props = {
  params: Promise<{ slug: string }>;
};

function visitTypeLabel(type: VisitType) {
  if (type === VisitType.MODEL_3D) return "3D";
  if (type === VisitType.PANORAMA_360) return "360";
  return "Hybride";
}

export async function generateMetadata({ params }: Props) {
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

  const isPublic =
    property.status === PropertyStatus.PUBLISHED &&
    property.catalogEnabled &&
    property.catalogStatus === CatalogStatus.ONLINE &&
    property.externalListingStatus !== ExternalListingStatus.OFFLINE;

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

  return (
    <main className="min-h-screen bg-[#f7f5f0]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="text-lg font-black tracking-tight text-[#0f2f3f]">
          Site Ready SHD
        </Link>
        <Button asChild variant="secondary" size="sm">
          <Link href="/admin/login">Admin</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-7xl px-6 pb-14">
        {isPreview ? (
          <div className="mb-6 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Prévisualisation admin — ce bien n’est pas visible publiquement dans le catalogue.
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
          <Card className="bg-white p-0 overflow-hidden">
            <div className="relative h-[320px] w-full bg-[#0f2f3f]/5 md:h-[420px]">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt={title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Home className="text-[#0f2f3f]/30" size={56} />
                </div>
              )}
            </div>
            <div className="p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Visite virtuelle</Badge>
                <Badge variant="published">{visitTypeLabel(property.visitType)}</Badge>
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-[#0f2f3f]">
                {title}
              </h1>
              {location ? (
                <p className="mt-3 flex items-center gap-2 text-[#667085]">
                  <MapPin size={18} /> {location}
                </p>
              ) : null}
              <p className="mt-6 text-lg leading-7 text-[#475467] whitespace-pre-line">
                {property.catalogDescription ??
                  property.description ??
                  "Découvrez ce bien grâce à la visite virtuelle immersive."}
              </p>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="bg-white">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#2f6f5e]">
                Prix
              </p>
              <p className="mt-2 text-4xl font-black text-[#0f2f3f]">
                {displayPrice != null ? formatPrice(displayPrice) : "Sur demande"}
              </p>

              <div className="mt-6 grid gap-2 text-sm text-[#475467]">
                {property.catalogSurface ? <p>Surface : {property.catalogSurface} m²</p> : null}
                {property.catalogRooms ? <p>Pièces : {property.catalogRooms}</p> : null}
                {property.catalogBedrooms ? <p>Chambres : {property.catalogBedrooms}</p> : null}
              </div>

              <div className="mt-8 grid gap-3">
                <Button asChild>
                  <Link href={`/visite/${property.slug}`}>Lancer la visite virtuelle</Link>
                </Button>
                {property.externalListingUrl ? (
                  <Button asChild variant="secondary">
                    <a href={property.externalListingUrl} target="_blank" rel="noreferrer">
                      Voir l’annonce Leboncoin
                    </a>
                  </Button>
                ) : null}
              </div>
            </Card>

            <Card className="bg-white">
              <h2 className="text-xl font-black text-[#0f2f3f]">
                Vous voulez une visite virtuelle pour votre bien ?
              </h2>
              <p className="mt-2 text-sm text-[#667085]">
                Ajoutez une visite 3D/360 à votre annonce et donnez plus envie aux acheteurs.
              </p>
              <div className="mt-5">
                <Button asChild variant="secondary">
                  <a href="mailto:contact@sitereadyshd.com">Nous contacter</a>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </main>
  );
}

