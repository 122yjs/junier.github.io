import { json } from "../../../lib/http";
import { getEnv, isGoogleOAuthConfigured } from "../../../lib/runtime";

export async function GET() {
  try {
    const runtime = getEnv();
    await Promise.all([
      runtime.DB.prepare("SELECT 1 FROM teachers LIMIT 1").first(),
      runtime.DB.prepare("SELECT 1 FROM classes LIMIT 1").first(),
      runtime.DB.prepare("SELECT 1 FROM submission_receipts LIMIT 1").first(),
    ]);
    return json({ ok: true, database: true, googleOAuth: isGoogleOAuthConfigured(runtime) });
  } catch {
    return json({ ok: false, database: false, googleOAuth: false }, { status: 503 });
  }
}
