import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("builds the existing student app without external runtime CSS", async () => {
  const html = await read("dist/client/index.html");
  const css = await read("dist/client/app.css");
  const tenant = await read("dist/client/student-tenant.js");
  assert.match(html, /<title>공주 달 관찰 탐험대<\/title>/);
  assert.match(html, /href="\/app\.css"/);
  assert.ok(css.length > 20_000, "compiled Tailwind CSS should be present");
  assert.match(tenant, /result\.classLabel/);
  assert.match(tenant, /result\.galleryEnabled/);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com|fonts\.googleapis\.com|google\.script\.run/);
});

test("keeps Blob upload, class sessions, and protected Drive image routes", async () => {
  const source = await read("public/index.html");
  const observations = await read("app/api/observations/route.ts");
  const images = await read("app/api/images/[id]/route.ts");
  const worker = await read("worker/index.ts");
  assert.match(source, /canvas\.toBlob\(/);
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /formData\.append\('photo', compressedImageBlob/);
  assert.doesNotMatch(source, /toDataURL\(|imageData|google\.script\.run/);
  assert.doesNotMatch(source, /renderCalendar\(\);\s*refreshGallery\(\);/);
  assert.match(observations, /getStudentSession\(request\)/);
  assert.match(images, /getTeacherSession/);
  assert.match(images, /getStudentSession/);
  assert.match(images, /parseObservationMetadata/);
  assert.match(worker, /student-tenant\.js/);
  assert.match(worker, /Content-Security-Policy/);
});

test("requests only drive.file among Google Drive scopes", async () => {
  const drive = await read("lib/google-drive.ts");
  const auth = await read("lib/auth.ts");
  assert.match(drive, /https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  const requestedScope = drive.match(/url\.searchParams\.set\("scope", ([^\n]+)\);/)?.[1];
  assert.equal(requestedScope, '["openid", "email", DRIVE_FILE_SCOPE].join(" ")');
  assert.equal((drive.match(/https:\/\/www\.googleapis\.com\/auth\/drive\.file/g) || []).length, 1);
  assert.match(drive, /unexpectedDriveScope/);
  assert.match(drive, /value !== DRIVE_FILE_SCOPE/);
  assert.match(drive, /access_type", "offline"/);
  assert.match(drive, /prompt", "consent"/);
  assert.match(auth, /STUDENT_SESSION_MAX_AGE = 60 \* 24 \* 60 \* 60/);
  assert.match(auth, /moon_teacher_session/);
  assert.match(auth, /moon_google_oauth_state/);
});

test("stores student content in Drive and only non-PII receipts in central D1", async () => {
  const route = await read("app/api/observations/route.ts");
  const drive = await read("lib/google-drive.ts");
  const migration = await read("drizzle/0001_central_drive_oauth.sql");
  assert.match(route, /uploadObservationFile/);
  assert.match(route, /insertReceipt/);
  assert.doesNotMatch(route, /BUCKET\.put|runtime\.BUCKET|INSERT INTO observations/);
  assert.match(drive, /description: JSON\.stringify\(input\.metadata\)/);
  const receiptsTable = migration.slice(migration.indexOf("CREATE TABLE `submission_receipts`"));
  assert.match(receiptsTable, /`request_id`/);
  assert.match(receiptsTable, /`drive_file_id`/);
  assert.doesNotMatch(receiptsTable, /student_name|student_number|observed_at|memo|image_bytes/);
});

test("supports teacher onboarding, Drive management, and complete disconnect", async () => {
  const callback = await read("app/api/oauth/google/callback/route.ts");
  const admin = await read("app/admin/page.tsx");
  const disconnect = await read("app/api/admin/disconnect/route.ts");
  const privacy = await read("app/privacy/page.tsx");
  const hosting = JSON.parse(await read(".openai/hosting.json"));
  assert.equal(hosting.d1, "DB");
  assert.match(callback, /encryptedRefreshToken/);
  assert.match(callback, /createDriveFolder/);
  assert.match(admin, /Google Drive 연결하기/);
  assert.match(admin, /새 QR 만들기/);
  assert.match(admin, /연결 해제/);
  assert.match(disconnect, /deleteTeacherWorkspace/);
  assert.match(disconnect, /revokeGoogleToken/);
  assert.match(privacy, /학생 사진·이름·번호·관찰 시각·메모/);
});
