import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatPrice(price?: number | null) {
  if (price == null) return null;

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}

export type CatalogListingType = "SALE" | "RENT";

export function formatCatalogPrice(
  price?: number | null,
  listingType: CatalogListingType = "SALE",
) {
  const formatted = formatPrice(price);
  if (!formatted) return null;
  if (listingType === "RENT") return `${formatted} / mois`;
  return formatted;
}

export function catalogListingTypeLabel(listingType: CatalogListingType) {
  return listingType === "RENT" ? "À louer" : "À vendre";
}

export function catalogPriceFieldLabel(listingType: CatalogListingType) {
  return listingType === "RENT" ? "Loyer mensuel" : "Prix de vente";
}
