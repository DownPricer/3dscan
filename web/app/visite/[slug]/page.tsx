import { PropertyStatus } from "@prisma/client";
import { MapPin } from "lucide-react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { VisitViewer } from "@/components/viewer/visit-viewer";
import { readSessionToken } from "@/lib/auth";
import { sessionCookieName } from "@/lib/auth-constants";
import { toPublicHybridData } from "@/lib/property-hybrid";
import { getPublicVisitUrl } from "@/lib/public-url";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/utils";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const property = await prisma.property.findUnique({
    where: { slug },
    include: {
      panoramaScenes: { orderBy: { sortOrder: "asc" } },
      hotspots: true,
    },
  });

  if (!property) {
    return { title: "Visite introuvable | Site Ready SHD" };
  }

  if (property.status !== PropertyStatus.PUBLISHED) {
    const cookieStore = await cookies();
    const session = await readSessionToken(
      cookieStore.get(sessionCookieName)?.value,
    );
    if (!session) {
      return { title: "Visite introuvable | Site Ready SHD" };
    }
  }

  return {
    title: `${property.name} | Visite virtuelle 3D`,
    description: property.description ?? `Visite virtuelle 3D de ${property.name}`,
  };
}

export default async function VisitPage({ params }: Props) {
  const { slug } = await params;
  const property = await prisma.property.findUnique({
    where: { slug },
    include: {
      panoramaScenes: { orderBy: { sortOrder: "asc" } },
      hotspots: true,
    },
  });

  if (!property) {
    notFound();
  }

  let isPreview = false;
  if (property.status !== PropertyStatus.PUBLISHED) {
    const cookieStore = await cookies();
    const session = await readSessionToken(
      cookieStore.get(sessionCookieName)?.value,
    );
    if (!session) {
      notFound();
    }
    isPreview = true;
  }

  const location = [property.address, property.city, property.postalCode]
    .filter(Boolean)
    .join(", ");
  const price = formatPrice(property.price);

  return (
    <main className="min-h-screen bg-[#f7f5f0]">
      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#2f6f5e]">
              Visite virtuelle 3D{isPreview ? " — Prévisualisation brouillon" : ""}
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-[#0f2f3f] md:text-6xl">
              {property.name}
            </h1>
            {location ? (
              <p className="mt-3 flex items-center gap-2 text-[#667085]">
                <MapPin size={18} /> {location}
              </p>
            ) : null}
          </div>
          {price ? (
            <div className="rounded-full bg-white px-5 py-3 text-lg font-black text-[#0f2f3f] shadow-sm">
              {price}
            </div>
          ) : null}
        </div>

        <VisitViewer
          visitType={property.visitType}
          modelUrl={property.modelUrl}
          modelType={property.modelType}
          propertyName={property.name}
          {...toPublicHybridData(property)}
        />

        <div className="mt-6 grid gap-5 md:grid-cols-[1fr_360px]">
          <div className="premium-card rounded-[2rem] p-6">
            <h2 className="text-2xl font-black text-[#0f2f3f]">Description</h2>
            <p className="mt-3 whitespace-pre-line leading-7 text-[#475467]">
              {property.description ||
                "Explorez cette propriété grâce à la visite virtuelle 3D interactive."}
            </p>
          </div>
          <div className="premium-card rounded-[2rem] p-6">
            <h2 className="text-xl font-black text-[#0f2f3f]">Lien partageable</h2>
            <p className="mt-3 break-all text-sm text-[#667085]">
              {getPublicVisitUrl(property.slug)}
            </p>
            <p className="mt-4 text-sm text-[#667085]">
              Compatible mobile, tablette et ordinateur. Utilisez les boutons du
              viewer pour copier ou partager cette visite.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
