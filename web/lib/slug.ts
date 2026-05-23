import { prisma } from "@/lib/prisma";

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createUniquePropertySlug(name: string, ignoreId?: string) {
  const base = slugify(name) || "visite";
  let slug = base;
  let suffix = 2;

  while (
    await prisma.property.findFirst({
      where: {
        slug,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}
