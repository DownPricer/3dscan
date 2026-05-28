import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  auditExtractedMatterportBackup,
  extractZipEntries,
  parseZipCentralDirectory,
  renderMatterportAuditMarkdown,
} from "../lib/matterport-backup-audit";

function repoRootFromCwd() {
  return path.basename(process.cwd()) === "web" ? path.dirname(process.cwd()) : process.cwd();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\.zip$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    throw new Error("Usage: tsx scripts/audit-matterport-backup.ts <backup.zip>");
  }

  const repoRoot = repoRootFromCwd();
  const zipPath = path.resolve(process.cwd(), input);
  const sourceName = path.basename(zipPath);
  const importId = `${slugify(sourceName) || "matterport-backup"}-${Date.now()}`;
  const webRoot = path.basename(process.cwd()) === "web" ? process.cwd() : path.join(repoRoot, "web");
  const extractRoot = path.join(webRoot, "public", "uploads", "matterport", importId, "extracted");
  const publicBaseUrl = `/uploads/matterport/${importId}/extracted`;

  await mkdir(extractRoot, { recursive: true });

  const zip = await readFile(zipPath);
  const entries = parseZipCentralDirectory(zip);
  const { extractedRelPaths } = await extractZipEntries(zip, entries, {
    outputDir: extractRoot,
    maxTotalBytes: Math.max(zip.length * 8, 1024 * 1024 * 1024),
  });

  const audit = await auditExtractedMatterportBackup({
    rootDir: extractRoot,
    relPaths: extractedRelPaths,
    sourceName,
    publicBaseUrl,
  });

  const inventoryPath = path.join(repoRoot, "matterport_backup_inventory.json");
  const reportPath = path.join(repoRoot, "MATTERPORT_BACKUP_DEEP_AUDIT.md");
  const manifestPath = path.join(extractRoot, "matterport_local_manifest.json");

  await writeFile(inventoryPath, JSON.stringify(audit, null, 2), "utf8");
  await writeFile(reportPath, renderMatterportAuditMarkdown(audit), "utf8");
  await writeFile(manifestPath, JSON.stringify(audit.manifest, null, 2), "utf8");

  console.log(`Audit écrit: ${reportPath}`);
  console.log(`Inventaire écrit: ${inventoryPath}`);
  console.log(`Manifest écrit: ${manifestPath}`);
  console.log(`Panoramas candidats: ${audit.manifest.summary.panoramaCandidates}`);
  console.log(`Groupes cube faces: ${audit.manifest.summary.cubeFaceSetCandidates}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
