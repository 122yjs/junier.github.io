import { clearTeacherCookie, getTeacherSession } from "../../../../lib/auth";
import { decryptString } from "../../../../lib/crypto";
import { revokeGoogleToken } from "../../../../lib/google-drive";
import { assertSameOrigin, errorResponse, HttpError, json } from "../../../../lib/http";
import { getTokenEncryptionSecret } from "../../../../lib/runtime";
import { deleteTeacherWorkspace, getTeacherWorkspace } from "../../../../lib/tenants";

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getTeacherSession(request);
    if (!session) throw new HttpError(401, "교사 로그인 후 이용해 주세요.");
    const workspace = await getTeacherWorkspace(session.teacherId);
    if (!workspace) throw new HttpError(404, "교사 연결 정보를 찾을 수 없습니다.");

    let refreshToken: string | null = null;
    try {
      refreshToken = await decryptString(
        workspace.teacher.encryptedRefreshToken,
        getTokenEncryptionSecret(),
      );
    } catch {
      // Central records must still be removable even if the old token cannot be decrypted.
    }

    await deleteTeacherWorkspace(workspace.teacher.id, workspace.classRecord.id);
    if (refreshToken) {
      await revokeGoogleToken(refreshToken).catch((error) => {
        console.warn("Google token revocation failed after local disconnect", error);
      });
    }
    return json(
      {
        ok: true,
        message: "중앙 서비스 연결을 해제했습니다. 선생님의 Google Drive 폴더와 사진은 그대로 남아 있습니다.",
      },
      { headers: { "Set-Cookie": clearTeacherCookie() } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
