import { getTeacherSession } from "../../../../lib/auth";
import {
  getTeacherAccessToken,
  googleDriveUserMessage,
  listObservationFiles,
  parseObservationMetadata,
} from "../../../../lib/google-drive";
import { errorResponse, HttpError, json } from "../../../../lib/http";
import { getTeacherWorkspace } from "../../../../lib/tenants";

export async function GET(request: Request) {
  try {
    const session = await getTeacherSession(request);
    if (!session) throw new HttpError(401, "교사 로그인 후 이용해 주세요.");
    const workspace = await getTeacherWorkspace(session.teacherId);
    if (!workspace) throw new HttpError(404, "교사 제출함 정보를 찾을 수 없습니다.");

    const url = new URL(request.url);
    const cursor = normalizePageToken(url.searchParams.get("cursor"));
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 30));
    const accessToken = await getTeacherAccessToken(request, workspace.teacher);
    const page = await listObservationFiles({
      accessToken,
      folderId: workspace.classRecord.driveFolderId,
      classId: workspace.classRecord.id,
      pageToken: cursor,
      pageSize: limit,
      visibleOnly: false,
    });
    const items = (page.files || []).flatMap((file) => {
      const metadata = parseObservationMetadata(file);
      if (!metadata) return [];
      return [{
        id: metadata.requestId,
        studentNumber: metadata.studentNumber,
        studentName: metadata.studentName,
        observedAt: metadata.observedAt,
        memo: metadata.memo,
        imageBytes: Number(file.size || 0),
        status: metadata.status,
        createdAt: metadata.createdAt,
        imageUrl: `/api/images/${encodeURIComponent(metadata.requestId)}`,
        driveUrl: file.webViewLink || null,
      }];
    });
    return json({
      items,
      hasMore: Boolean(page.nextPageToken),
      nextCursor: page.nextPageToken || null,
      classLabel: workspace.classRecord.label,
    });
  } catch (error) {
    const driveMessage = googleDriveUserMessage(error);
    return driveMessage ? json({ message: driveMessage }, { status: 503 }) : errorResponse(error);
  }
}

function normalizePageToken(value: string | null) {
  if (!value) return null;
  if (value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HttpError(400, "목록 이어보기 정보가 올바르지 않습니다.");
  }
  return value;
}
