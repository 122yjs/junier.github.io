import { clearTeacherCookie, getTeacherSession } from "../../../../lib/auth";
import { assertSameOrigin, errorResponse, json } from "../../../../lib/http";
import { isGoogleOAuthConfigured } from "../../../../lib/runtime";
import { getTeacherWorkspace } from "../../../../lib/tenants";

export async function GET(request: Request) {
  try {
    const session = await getTeacherSession(request);
    if (!session) {
      return json({ authenticated: false, googleOAuthConfigured: isGoogleOAuthConfigured() });
    }
    const workspace = await getTeacherWorkspace(session.teacherId);
    return json({
      authenticated: Boolean(workspace),
      googleOAuthConfigured: isGoogleOAuthConfigured(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    return json({ ok: true }, { headers: { "Set-Cookie": clearTeacherCookie() } });
  } catch (error) {
    return errorResponse(error);
  }
}
