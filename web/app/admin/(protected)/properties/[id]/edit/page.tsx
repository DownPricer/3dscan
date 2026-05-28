import Link from "next/link";
import { notFound } from "next/navigation";
import { PropertyForm } from "@/components/admin/property-form";
import { normalizeMatterportAuditSummary } from "@/lib/matterport-backup-audit";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditPropertyPage({ params }: Props) {
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      panoramaScenes: { orderBy: { sortOrder: "asc" } },
      hotspots: true,
    },
  });

  if (!property) notFound();

  const propertyForForm = {
    ...property,
    matterportAuditSummary: normalizeMatterportAuditSummary(property.matterportAuditSummary),
  };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm font-semibold text-[#2f6f5e]">
          ← Retour au dashboard
        </Link>
        <h1 className="mt-3 text-4xl font-black tracking-tight text-[#0f2f3f]">
          Modifier {property.name}
        </h1>
        <p className="mt-2 text-[#667085]">
          Mettez à jour les informations, le statut ou remplacez le modèle 3D.
        </p>
      </div>
      <PropertyForm property={propertyForForm} />
    </div>
  );
}
