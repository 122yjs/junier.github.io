import { createOAuthState } from "../../../../../lib/auth";
import { buildGoogleAuthorizationUrl } from "../../../../../lib/google-drive";
import { isGoogleOAuthConfigured } from "../../../../../lib/runtime";

export async function GET(request: Request) {
  if (!isGoogleOAuthConfigured()) {
    return redirectToAdmin(request, "Google OAuth 서버 설정이 아직 완료되지 않았습니다.");
  }
  const url = new URL(request.url);
  const { state, setCookie } = await createOAuthState(url.searchParams.get("returnTo") || "/admin");
  return new Response(null, {
    status: 302,
    headers: {
      Location: buildGoogleAuthorizationUrl(request, state),
      "Set-Cookie": setCookie,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function redirectToAdmin(request: Request, message: string) {
  const url = new URL("/admin", request.url);
  url.searchParams.set("error", message);
  return Response.redirect(url, 302);
}
