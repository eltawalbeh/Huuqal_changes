/**
 * HuuQa legacy Storage browser-cache policy migration.
 *
 * DRY-RUN BY DEFAULT. Requires a service-role key only in a local env variable.
 * Never call from a browser or Figma Make. Never commit keys or backups.
 *
 * Usage (from a trusted local Node 20+ directory with @supabase/supabase-js):
 *  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cache-policy-existing-media.mjs
 *  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/cache-policy-existing-media.mjs --apply --backup-dir /secure/location/huuqa-backup --confirm-count 53
 *
 * No format conversion, compression, renaming, deletion or changing URLs.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, isAbsolute, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "make-a3f1a5bb-media";
const FOLDER = "menu";
const TTL = "604800";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const option = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your private shell environment.");
}
if (!url.includes("onitstcxsivzpclvdkba.supabase.co")) {
  throw new Error("Safety stop: SUPABASE_URL must target HuuQa's existing project.");
}
if (apply && option("--confirm-count") !== "53") {
  throw new Error("Safety stop: add --confirm-count 53 to allow the approved 53-object migration.");
}
const backupDir = option("--backup-dir");
if (apply && (!backupDir || !isAbsolute(backupDir))) {
  throw new Error("Safety stop: specify --backup-dir /absolute/private/path outside the Git repository.");
}

const client = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const store = client.storage.from(BUCKET);

async function listAll() {
  const collected = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await store.list(FOLDER, {
      limit: 100, offset, sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    const files = (data ?? []).filter((obj) => obj.id && obj.name);
    collected.push(...files);
    if ((data ?? []).length < 100) break;
  }
  return collected;
}

const inventory = await listAll();
const needsChange = inventory.filter((o) => o.metadata?.cacheControl !== TTL);
const totalBytes = inventory.reduce((acc, o) => acc + Number(o.metadata?.size ?? 0), 0);
console.log(JSON.stringify({
  mode: apply ? "APPLY" : "DRY RUN",
  bucket: BUCKET,
  folder: FOLDER,
  items: inventory.length,
  needingUpdate: needsChange.length,
  totalBytes,
  desiredCacheSeconds: Number(TTL),
}, null, 2));

if (!apply) {
  console.log("DRY RUN complete. No assets or metadata changed.");
  process.exit(0);
}
if (inventory.length !== 53) {
  throw new Error("Safety stop: storage object count changed; inspect before proceeding.");
}

const destination = resolve(backupDir);
await mkdir(destination, { recursive: true });
const backups = [];
// Backup *every* object before mutating *any* object.
for (const object of needsChange) {
  if (object.name.includes("/") || object.name === "." || object.name === "..") {
    throw new Error("Unexpected Storage object name");
  }
  const path = FOLDER + "/" + object.name;
  const { data, error } = await store.download(path);
  if (error || !data) throw new Error("Backup failed for " + path + ": " + (error?.message ?? "empty download"));
  const buffer = Buffer.from(await data.arrayBuffer());
  const storedSize = Number(object.metadata?.size ?? buffer.length);
  if (buffer.length !== storedSize) {
    throw new Error("Safety stop: downloaded bytes differ from Storage size for " + path);
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  await writeFile(join(destination, object.name), buffer, { flag: "wx" });
  backups.push({
    name: object.name, path, sha256,
    size: buffer.length,
    mimetype: object.metadata?.mimetype || "application/octet-stream",
  });
}
await writeFile(join(destination, "manifest.json"), JSON.stringify({
  bucket: BUCKET, createdAt: new Date().toISOString(), files: backups,
}, null, 2), { flag: "wx" });
console.log("Verified local backups for all affected files. Beginning supported Storage API updates.");

// The Storage API update() replaces existing bytes with the *same* bytes from
// the verified backup and changes cacheControl. Existing URLs remain unchanged.
// Do not auto-retry a failed update or attempt an automatic rollback.
for (const backup of backups) {
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(join(destination, backup.name));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== backup.sha256) throw new Error("Backup hash changed for " + backup.path);

  const { error } = await store.update(backup.path, bytes, {
    cacheControl: TTL,
    contentType: backup.mimetype,
    upsert: true,
  });
  if (error) {
    throw new Error("STOP: Storage API update failed at " + backup.path + ": " + error.message +
      ". Previously processed objects may have new cache metadata; originals are backed up in " + destination);
  }
  console.log("Updated cache for " + backup.path);
}

const after = await listAll();
const stillIncorrect = after.filter((obj) => obj.metadata?.cacheControl !== TTL);
console.log(JSON.stringify({
  status: stillIncorrect.length === 0 ? "metadata_verified" : "manual_verification_required",
  updated: backups.length,
  stillIncorrect: stillIncorrect.map((o) => o.name),
}, null, 2));
if (stillIncorrect.length) process.exitCode = 1;
