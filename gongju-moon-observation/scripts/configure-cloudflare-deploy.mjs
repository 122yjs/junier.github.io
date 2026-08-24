import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../wrangler.cloudflare.jsonc", import.meta.url);
const outputPath = new URL("../wrangler.cloudflare.deploy.json", import.meta.url);
const domain = String(process.env.CLOUDFLARE_CUSTOM_DOMAIN || "").trim().toLowerCase();

if (!domain) {
  throw new Error("CLOUDFLARE_CUSTOM_DOMAIN이 없습니다. Google OAuth 공개 운영에는 소유한 도메인이 필요합니다.");
}
if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
  throw new Error("CLOUDFLARE_CUSTOM_DOMAIN은 프로토콜과 경로를 제외한 호스트명이어야 합니다.");
}

const config = JSON.parse(await readFile(sourcePath, "utf8"));
config.workers_dev = false;
config.routes = [{ pattern: domain, custom_domain: true }];
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Cloudflare 배포 도메인: https://${domain}`);
