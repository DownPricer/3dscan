import { ExternalListingStatus } from "@prisma/client";
import { checkExternalListing } from "../lib/external-listing";
import { prisma } from "../lib/prisma";

async function main() {
  const hours = Number(process.env.CATALOG_CHECK_HOURS ?? 72);
  const take = Number(process.env.CATALOG_CHECK_TAKE ?? 20);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const candidates = await prisma.property.findMany({
    where: {
      externalListingUrl: { not: null, notIn: [""] },
      OR: [{ externalLastCheckedAt: null }, { externalLastCheckedAt: { lt: cutoff } }],
    },
    orderBy: { externalLastCheckedAt: "asc" },
    take,
    select: { id: true },
  });

  const summary = { checked: 0, online: 0, offline: 0, errors: 0 };

  for (const property of candidates) {
    const updated = await checkExternalListing(property.id);
    summary.checked += 1;
    if (updated.externalListingStatus === ExternalListingStatus.ONLINE) summary.online += 1;
    else if (updated.externalListingStatus === ExternalListingStatus.OFFLINE) summary.offline += 1;
    else if (updated.externalListingStatus === ExternalListingStatus.CHECK_ERROR) summary.errors += 1;
  }

  console.log(JSON.stringify(summary));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

