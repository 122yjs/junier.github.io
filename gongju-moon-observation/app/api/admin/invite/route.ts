import { getTeacherSession } from "../../../../lib/auth";
import { decryptString, encryptString, randomToken, sha256Hex } from "../../../../lib/crypto";
import { assertSameOrigin, errorResponse, HttpError, json } from "../../../../lib/http";
import { getPublicOrigin, getTokenEncryptionSecret } from "../../../../lib/runtime";
import { getTeacherWorkspace, updateClass } from "../../../../lib/tenants";

export async function GET(request: Request) {
  try {
    const session = await getTeacherSession(request);
    if (!session) throw new HttpError(401, "교사 로그인 후 이용해 주세요.");
    const workspace = await getTeacherWorkspace(session.teacherId);
    if (!workspace) throw new HttpError(404, "교사 제출함 정보를 찾을 수 없습니다.");
    const inviteToken = await decryptString(
      workspace.classRecord.encryptedInviteToken,
      getTokenEncryptionSecret(),
    );
    return json({
      joinUrl: `${getPublicOrigin(request)}/join?t=${encodeURIComponent(inviteToken)}`,
      classLabel: workspace.classRecord.label,
      validFor: "새로 입장한 학생 기기에서 60일",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getTeacherSession(request);
    if (!session) throw new HttpError(401, "교사 로그인 후 이용해 주세요.");
    const workspace = await getTeacherWorkspace(session.teacherId);
    if (!workspace) throw new HttpError(404, "교사 제출함 정보를 찾을 수 없습니다.");
    const inviteToken = randomToken(32);
    await updateClass({
      ...workspace.classRecord,
      inviteTokenHash: await sha256Hex(inviteToken),
      encryptedInviteToken: await encryptString(inviteToken, getTokenEncryptionSecret()),
      updatedAt: new Date().toISOString(),
    });
    return json({
      ok: true,
      joinUrl: `${getPublicOrigin(request)}/join?t=${encodeURIComponent(inviteToken)}`,
      classLabel: workspace.classRecord.label,
      message: "새 수업 참여 링크를 만들었습니다. 기존 링크로는 새 기기가 입장할 수 없습니다.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
