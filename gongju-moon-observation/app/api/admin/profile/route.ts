import { getTeacherSession } from "../../../../lib/auth";
import {
  getTeacherAccessToken,
  googleDriveUserMessage,
  updateDriveFile,
} from "../../../../lib/google-drive";
import { assertSameOrigin, errorResponse, HttpError, json } from "../../../../lib/http";
import { getPublicOrigin, isGoogleOAuthConfigured } from "../../../../lib/runtime";
import { getTeacherWorkspace, updateClass } from "../../../../lib/tenants";

export async function GET(request: Request) {
  try {
    const session = await getTeacherSession(request);
    if (!session) {
      return json({ authenticated: false, googleOAuthConfigured: isGoogleOAuthConfigured() });
    }
    const workspace = await getTeacherWorkspace(session.teacherId);
    if (!workspace) throw new HttpError(404, "교사 제출함 정보를 찾을 수 없습니다.");
    return json({
      authenticated: true,
      googleOAuthConfigured: isGoogleOAuthConfigured(),
      teacher: {
        email: workspace.teacher.email,
        displayName: workspace.teacher.displayName,
        rootFolderUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(workspace.teacher.rootFolderId)}`,
      },
      classRoom: {
        id: workspace.classRecord.id,
        label: workspace.classRecord.label,
        galleryEnabled: workspace.classRecord.galleryEnabled,
        driveFolderUrl: `https://drive.google.com/drive/folders/${encodeURIComponent(workspace.classRecord.driveFolderId)}`,
      },
      reconnectUrl: `${getPublicOrigin(request)}/api/oauth/google/start?returnTo=%2Fadmin`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await getTeacherSession(request);
    if (!session) throw new HttpError(401, "교사 로그인 후 이용해 주세요.");
    const workspace = await getTeacherWorkspace(session.teacherId);
    if (!workspace) throw new HttpError(404, "교사 제출함 정보를 찾을 수 없습니다.");

    const payload = (await request.json()) as { label?: unknown; galleryEnabled?: unknown };
    const label = normalizeLabel(payload.label ?? workspace.classRecord.label);
    const galleryEnabled = typeof payload.galleryEnabled === "boolean"
      ? payload.galleryEnabled
      : workspace.classRecord.galleryEnabled;
    const accessToken = await getTeacherAccessToken(request, workspace.teacher);
    if (label !== workspace.classRecord.label) {
      await updateDriveFile(accessToken, workspace.classRecord.driveFolderId, { name: label });
    }
    const classRecord = await updateClass({
      ...workspace.classRecord,
      label,
      galleryEnabled,
      updatedAt: new Date().toISOString(),
    });
    return json({
      ok: true,
      classRoom: {
        id: classRecord.id,
        label: classRecord.label,
        galleryEnabled: classRecord.galleryEnabled,
      },
      message: "학급 설정을 저장했습니다.",
    });
  } catch (error) {
    const driveMessage = googleDriveUserMessage(error);
    return driveMessage ? json({ message: driveMessage }, { status: 503 }) : errorResponse(error);
  }
}

function normalizeLabel(value: unknown) {
  if (typeof value !== "string") throw new HttpError(400, "학급명을 입력해 주세요.");
  const label = value.normalize("NFC").trim();
  if (!label || Array.from(label).length > 50 || /\p{Cc}/u.test(label)) {
    throw new HttpError(400, "학급명은 1자 이상 50자 이하로 입력해 주세요.");
  }
  return label;
}
