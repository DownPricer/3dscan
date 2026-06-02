import {
  CatalogStatus,
  ExternalListingStatus,
  PropertyStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  getCatalogVisibilityReasons,
  isVisibleInCatalog,
} from "../lib/catalog-visibility";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function runVisibilityLogicTests() {
  const visibleBase = {
    status: PropertyStatus.PUBLISHED,
    catalogEnabled: true,
    catalogStatus: CatalogStatus.ONLINE,
    externalListingUrl: null,
    externalListingStatus: ExternalListingStatus.UNKNOWN,
  };

  assert(isVisibleInCatalog(visibleBase), "cas 1: publié + catalogue ON + pas de lien");
  assert(
    !isVisibleInCatalog({ ...visibleBase, status: PropertyStatus.DRAFT }),
    "cas 2: brouillon ne doit pas apparaître",
  );
  assert(
    !isVisibleInCatalog({ ...visibleBase, catalogEnabled: false }),
    "cas 3: catalogue désactivé ne doit pas apparaître",
  );
  assert(
    !isVisibleInCatalog({ ...visibleBase, catalogStatus: CatalogStatus.DRAFT }),
    "cas 4: statut catalogue DRAFT ne doit pas apparaître",
  );
  assert(
    !isVisibleInCatalog({
      ...visibleBase,
      externalListingUrl: "https://www.leboncoin.fr/test",
      externalListingStatus: ExternalListingStatus.OFFLINE,
    }),
    "cas 5: lien externe OFFLINE ne doit pas apparaître",
  );
  assert(
    isVisibleInCatalog({
      ...visibleBase,
      externalListingUrl: "https://www.leboncoin.fr/test",
      externalListingStatus: ExternalListingStatus.CHECK_ERROR,
    }),
    "cas 6: CHECK_ERROR doit apparaître",
  );

  const reasons = getCatalogVisibilityReasons(visibleBase);
  assert(reasons.includes("Visible sur le catalogue"), "cas raisons: visible");
}

async function dumpDatabaseState() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      catalogEnabled: true,
      catalogStatus: true,
      externalListingUrl: true,
      externalListingStatus: true,
      catalogCoverImageUrl: true,
      coverImageUrl: true,
      listingType: true,
      catalogPrice: true,
    },
  });

  console.log("\n=== Diagnostic catalogue (DB) ===\n");
  for (const property of properties) {
    console.log(`- ${property.name} (${property.slug})`);
    console.log(`  type: ${property.listingType ?? "SALE"}`);
    console.log(
      `  prix catalogue: ${property.catalogPrice != null ? `${property.catalogPrice} €` : "—"}`,
    );
    console.log(`  visible: ${isVisibleInCatalog(property) ? "oui" : "non"}`);
    console.log(`  raisons: ${getCatalogVisibilityReasons(property).join(" | ")}`);
  }

  const visibleCount = properties.filter((property) => isVisibleInCatalog(property)).length;
  console.log(`\nTotal visible sur / : ${visibleCount}/${properties.length}\n`);
}

async function main() {
  runVisibilityLogicTests();
  console.log("Tests logiques catalogue : OK");
  await dumpDatabaseState();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
