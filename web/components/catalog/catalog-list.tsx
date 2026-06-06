"use client";

import Link from "next/link";
import { ListingType, VisitType } from "@prisma/client";
import { BedDouble, Home, LayoutGrid, MapPin, Maximize2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  catalogListingTypeLabel,
  formatCatalogPrice,
  type CatalogListingType,
} from "@/lib/utils";

export type CatalogPropertyItem = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  price: number | null;
  visitType: VisitType;
  coverImageUrl: string | null;
  catalogTitle: string | null;
  catalogDescription: string | null;
  catalogPrice: number | null;
  listingType: ListingType;
  catalogCity: string | null;
  catalogPostalCode: string | null;
  catalogSurface: number | null;
  catalogRooms: number | null;
  catalogBedrooms: number | null;
  catalogCoverImageUrl: string | null;
  externalListingUrl: string | null;
};

type SortOption = "recent" | "price-asc" | "price-desc" | "name";
type ListingFilter = "all" | ListingType;

function visitTypeLabel(type: VisitType) {
  if (type === VisitType.MODEL_3D) return "3D";
  if (type === VisitType.PANORAMA_360) return "360";
  if (type === VisitType.MATTERPORT) return "Matterport";
  return "Hybride";
}

function resolveListingType(listingType?: ListingType | null): CatalogListingType {
  return listingType === ListingType.RENT ? "RENT" : "SALE";
}

function PropertyCard({ property }: { property: CatalogPropertyItem }) {
  const title = property.catalogTitle ?? property.name;
  const listingType = resolveListingType(property.listingType);
  const displayPrice = property.catalogPrice ?? property.price ?? null;
  const priceLabel = formatCatalogPrice(displayPrice, listingType);
  const city = property.catalogCity ?? property.city ?? null;
  const postal = property.catalogPostalCode ?? property.postalCode ?? null;
  const location = [city, postal].filter(Boolean).join(" ");
  const cover = property.catalogCoverImageUrl ?? property.coverImageUrl ?? null;
  const shortDescription =
    property.catalogDescription?.trim() ||
    "Découvrez ce bien grâce à une visite virtuelle immersive.";

  return (
    <Card className="group flex h-full flex-col overflow-hidden bg-white p-0 shadow-sm transition hover:shadow-lg">
      <div className="relative aspect-[16/10] min-h-[220px] w-full overflow-hidden bg-[#e8e4dc] sm:min-h-[240px]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#e8e4dc] to-[#d4cfc4]">
            <Home className="text-[#0f2f3f]/40" size={48} strokeWidth={1.5} />
            <span className="text-sm font-medium text-[#475467]">Photo à venir</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge variant="overlay">{catalogListingTypeLabel(listingType)}</Badge>
          <Badge variant="overlay">Visite virtuelle</Badge>
          <Badge variant="overlay">{visitTypeLabel(property.visitType)}</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="text-2xl font-black tracking-tight text-[#0f2f3f]">
          {priceLabel ?? "Prix sur demande"}
        </p>
        <h2 className="mt-2 text-lg font-bold leading-snug text-[#0f2f3f]">{title}</h2>
        {location ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#475467]">
            <MapPin size={15} className="shrink-0 text-[#0f2f3f]" /> {location}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-[#344054]">
          {property.catalogSurface ? (
            <span className="inline-flex items-center gap-1">
              <Maximize2 size={14} className="text-[#0f2f3f]" />
              {property.catalogSurface} m²
            </span>
          ) : null}
          {property.catalogRooms ? (
            <span className="inline-flex items-center gap-1">
              <LayoutGrid size={14} className="text-[#0f2f3f]" />
              {property.catalogRooms} pièces
            </span>
          ) : null}
          {property.catalogBedrooms ? (
            <span className="inline-flex items-center gap-1">
              <BedDouble size={14} className="text-[#0f2f3f]" />
              {property.catalogBedrooms} ch.
            </span>
          ) : null}
        </div>

        <p className="text-muted mt-3 line-clamp-2 text-sm leading-relaxed">{shortDescription}</p>

        <div className="mt-auto grid gap-2.5 pt-5">
          <Button asChild className="w-full">
            <Link href={`/bien/${property.slug}`}>Voir le bien</Link>
          </Button>
          <Button asChild variant="accent" className="w-full">
            <Link href={`/visite/${property.slug}`}>Lancer la visite</Link>
          </Button>
          {property.externalListingUrl ? (
            <Button asChild variant="secondary" className="w-full">
              <a href={property.externalListingUrl} target="_blank" rel="noreferrer">
                Voir l&apos;annonce Leboncoin
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function CatalogList({ properties }: { properties: CatalogPropertyItem[] }) {
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<SortOption>("recent");

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const property of properties) {
      const city = property.catalogCity ?? property.city;
      if (city?.trim()) set.add(city.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [properties]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cityQ = cityFilter.trim().toLowerCase();
    const max = maxPrice ? Number(maxPrice) : null;

    let list = properties.filter((property) => {
      const title = (property.catalogTitle ?? property.name).toLowerCase();
      const city = (property.catalogCity ?? property.city ?? "").toLowerCase();
      const postal = (property.catalogPostalCode ?? property.postalCode ?? "").toLowerCase();
      const price = property.catalogPrice ?? property.price ?? null;
      const listingType = resolveListingType(property.listingType);

      if (q && !title.includes(q) && !city.includes(q) && !postal.includes(q)) return false;
      if (cityQ && city !== cityQ) return false;
      if (listingFilter !== "all" && listingType !== listingFilter) return false;
      if (max != null && !Number.isNaN(max) && price != null && price > max) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "name") {
        return (a.catalogTitle ?? a.name).localeCompare(b.catalogTitle ?? b.name, "fr");
      }
      const priceA = a.catalogPrice ?? a.price ?? null;
      const priceB = b.catalogPrice ?? b.price ?? null;
      if (sort === "price-asc") {
        if (priceA == null) return 1;
        if (priceB == null) return -1;
        return priceA - priceB;
      }
      if (sort === "price-desc") {
        if (priceA == null) return 1;
        if (priceB == null) return -1;
        return priceB - priceA;
      }
      return 0;
    });

    return list;
  }, [properties, query, cityFilter, listingFilter, maxPrice, sort]);

  if (properties.length === 0) {
    return (
      <Card className="bg-white p-8 sm:p-10">
        <h2 className="text-2xl font-black text-[#0f2f3f]">Aucun bien en ligne pour le moment.</h2>
        <p className="text-muted mt-2">
          Revenez bientôt pour découvrir de nouvelles visites virtuelles.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="bg-white p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#475467]"
            />
            <Input
              type="search"
              placeholder="Rechercher un bien…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={listingFilter} onChange={(event) => setListingFilter(event.target.value as ListingFilter)}>
            <option value="all">Tous les types</option>
            <option value={ListingType.SALE}>Vente</option>
            <option value={ListingType.RENT}>Location</option>
          </Select>
          <Select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
            <option value="">Toutes les villes</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min="0"
            placeholder="Prix max (€)"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
          />
          <Select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}>
            <option value="recent">Plus récents</option>
            <option value="price-asc">Prix croissant</option>
            <option value="price-desc">Prix décroissant</option>
            <option value="name">Nom A → Z</option>
          </Select>
        </div>
        <p className="text-muted mt-3 text-sm">
          {filtered.length} bien{filtered.length > 1 ? "s" : ""} affiché
          {filtered.length > 1 ? "s" : ""}
        </p>
      </Card>

      {filtered.length === 0 ? (
        <Card className="bg-white p-8 text-center">
          <p className="text-lg font-bold text-[#0f2f3f]">Aucun résultat pour ces filtres.</p>
          <p className="text-muted mt-2 text-sm">Modifiez la recherche ou réinitialisez les filtres.</p>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}
