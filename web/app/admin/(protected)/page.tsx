import Link from "next/link";
import { Eye, Home, Plus } from "lucide-react";
import { CatalogDebugButton } from "@/components/admin/catalog-debug-button";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { DeletePropertyButton } from "@/components/admin/delete-property-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPublicVisitUrl } from "@/lib/public-url";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#2f6f5e]">
            Dashboard
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-[#0f2f3f]">
            Propriétés 3D
          </h1>
        </div>
        <Button asChild size="lg">
          <Link href="/admin/properties/new">
            <Plus size={18} /> Ajouter une propriété
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white">
          <Home className="mb-4 text-[#2f6f5e]" />
          <p className="text-sm font-semibold text-[#475467]">Propriétés créées</p>
          <p className="mt-2 text-4xl font-black text-[#0f2f3f]">{properties.length}</p>
        </Card>
        <Card className="bg-white">
          <Eye className="mb-4 text-[#2f6f5e]" />
          <p className="text-sm font-semibold text-[#475467]">Publiées</p>
          <p className="mt-2 text-4xl font-black text-[#0f2f3f]">
            {properties.filter((property) => property.status === "PUBLISHED").length}
          </p>
        </Card>
      </div>

      <Card className="bg-white">
        <div className="border-b border-[#eee7dc] p-6">
          <h2 className="text-xl font-black text-[#0f2f3f]">Diagnostic catalogue public</h2>
          <p className="text-muted mt-1 text-sm">
            Comprenez pourquoi un bien publié n&apos;apparaît pas sur la page d&apos;accueil.
          </p>
        </div>
        <div className="p-6">
          <CatalogDebugButton />
        </div>
      </Card>

      <Card className="overflow-hidden bg-white p-0">
        <div className="border-b border-[#eee7dc] p-6">
          <h2 className="text-xl font-black text-[#0f2f3f]">Liste des propriétés</h2>
        </div>
        {properties.length === 0 ? (
          <div className="p-8 text-center text-[#475467]">
            Aucune propriété pour le moment. Cliquez sur &quot;Ajouter une propriété&quot;.
          </div>
        ) : (
          <div className="divide-y divide-[#eee7dc]">
            {properties.map((property) => {
              const publicUrl = getPublicVisitUrl(property.slug);
              return (
                <div
                  key={property.id}
                  className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-[#0f2f3f]">{property.name}</h3>
                      <Badge variant={property.status === "PUBLISHED" ? "published" : "draft"}>
                        {property.status === "PUBLISHED" ? "Publié" : "Brouillon"}
                      </Badge>
                    </div>
                    <p className="text-muted mt-1 text-sm">
                      {[property.address, property.city, property.postalCode]
                        .filter(Boolean)
                        .join(", ") || "Adresse non renseignée"}
                    </p>
                    <p className="mt-1 text-xs font-medium text-[#667085]">
                      Créée le {formatDate(property.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/visite/${property.slug}`} target="_blank">
                        Voir
                      </Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={`/admin/properties/${property.id}/edit`}>
                        Modifier
                      </Link>
                    </Button>
                    <CopyLinkButton url={publicUrl} />
                    <DeletePropertyButton id={property.id} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
