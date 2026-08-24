import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("direct Cloudflare build has D1 and no R2 binding", async () => {
  const input = JSON.parse(await read("wrangler.cloudflare.jsonc"));
  const output = JSON.parse(await read("dist/server/wrangler.json"));
  assert.equal(input.name, "gongju-moon-observation");
  assert.deepEqual(input.d1_databases.map((item) => item.binding), ["DB"]);
  assert.equal(input.d1_databases[0].migrations_dir, "drizzle-cloudflare");
  assert.equal(input.r2_buckets, undefined);
  assert.equal(output.main, "index.js");
  assert.equal(output.assets.directory, "../client");
  assert.deepEqual(output.d1_databases.map((item) => item.binding), ["DB"]);
  assert.equal(output.r2_buckets?.length || 0, 0);
});

test("fresh Cloudflare migration cannot store student PII", async () => {
  const migration = await read("drizzle-cloudflare/0000_central_drive_oauth.sql");
  assert.match(migration, /CREATE TABLE `teachers`/);
  assert.match(migration, /CREATE TABLE `classes`/);
  assert.match(migration, /CREATE TABLE `submission_receipts`/);
  assert.doesNotMatch(
    migration,
    /student_name|student_number|observed_at|memo|image_key|image_bytes|CREATE TABLE `observations`/,
  );
});

test("production config generator requires an owned custom domain", async () => {
  const generator = await read("scripts/configure-cloudflare-deploy.mjs");
  assert.match(generator, /CLOUDFLARE_CUSTOM_DOMAIN/);
  assert.match(generator, /custom_domain: true/);
  assert.match(generator, /config\.workers_dev = false/);
});
