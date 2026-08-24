import { getStudentSession } from "../../../lib/auth";
import {
  deleteDriveFile,
  getTeacherAccessToken,
  googleDriveUserMessage,
  listObservationFiles,
  parseObservationMetadata,
  uploadObservationFile,
} from "../../../lib/google-drive";
import { assertSameOrigin, errorResponse, HttpError, json } from "../../../lib/http";
import {
  detectImageType,
  maskStudentName,
  stripImageMetadata,
  validateObservationForm,
} from "../../../lib/observations";
import {
  countRecentSubmissions,
  countVisibleReceipts,
  getClassAndTeacher,
  getReceipt,
  insertReceipt,
} from "../../../lib/tenants";

export async function GET(request: Request) {
  try {
    const session = await getStudentSession(request);
    if (!session) throw new HttpError(401, "수업 참여 링크로 입장한 뒤 이용해 주세요.");
    const workspace = await getClassAndTeacher(session.classId);
    if (!workspace) throw new HttpError(404, "수업 제출함을 찾을 수 없습니다.");
    if (!workspace.classRecord.galleryEnabled) {
      throw new HttpError(403, "선생님이 우리 반 갤러리를 사용하지 않도록 설정했습니다.");
    }

    const url = new URL(request.url);
    const limit = Math.min(24, Math.max(1, Number(url.searchParams.get("limit")) || 12));
    const cursor = normalizePageToken(url.searchParams.get("cursor"));
    const accessToken = await getTeacherAccessToken(request, workspace.teacher);
    const [page, total] = await Promise.all([
      listObservationFiles({
        accessToken,
        folderId: workspace.classRecord.driveFolderId,
        classId: workspace.classRecord.id,
        pageToken: cursor,
        pageSize: limit,
        visibleOnly: true,
      }),
      countVisibleReceipts(workspace.classRecord.id),
    ]);

    const items = (page.files || []).flatMap((file) => {
      const metadata = parseObservationMetadata(file);
      if (!metadata || metadata.status !== "visible") return [];
      return [{
        id: metadata.requestId,
        studentNumber: metadata.studentNumber,
        displayName: maskStudentName(metadata.studentName),
        observedAt: metadata.observedAt,
        memo: metadata.memo,
        imageUrl: `/api/images/${encodeURIComponent(metadata.requestId)}`,
      }];
    });

    return json({
      items,
      total,
      hasMore: Boolean(page.nextPageToken),
      nextCursor: page.nextPageToken || null,
      classLabel: workspace.classRecord.label,
    });
  } catch (error) {
    const driveMessage = googleDriveUserMessage(error);
    return driveMessage ? json({ message: driveMessage }, { status: 503 }) : errorResponse(error);
  }
}

export async function POST(request: Request) {
  let uploadedFileId: string | null = null;
  try {
    assertSameOrigin(request);
    const session = await getStudentSession(request);
    if (!session) throw new HttpError(401, "수업 참여 링크로 입장한 뒤 제출해 주세요.");

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 4 * 1024 * 1024) {
      throw new HttpError(413, "제출 사진의 용량이 너무 큽니다.");
    }
    const workspace = await getClassAndTeacher(session.classId);
    if (!workspace) throw new HttpError(404, "수업 제출함을 찾을 수 없습니다.");

    const input = validateObservationForm(await request.formData());
    const existing = await getReceipt(input.requestId);
    if (existing) {
      if (existing.classId !== session.classId || existing.sessionId !== session.sid) {
        throw new HttpError(409, "이미 처리된 제출 요청입니다.");
      }
      return json({ ok: true, id: existing.driveFileId, message: "이미 제출된 사진입니다." });
    }

    const recent = await countRecentSubmissions(session.sid, session.classId);
    if (recent.deviceCount >= 3) {
      throw new HttpError(429, "10분 동안 제출할 수 있는 횟수를 넘었습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (recent.classCount >= 100) {
      throw new HttpError(429, "현재 제출이 많습니다. 잠시 후 다시 시도해 주세요.");
    }

    const sourceBytes = new Uint8Array(await input.photo.arrayBuffer());
    const image = detectImageType(sourceBytes);
    const bytes = stripImageMetadata(sourceBytes, image.contentType);
    const createdAt = new Date().toISOString();
    const fileName = `${createdAt.replace(/[:.]/g, "-")}-${crypto.randomUUID()}.${image.extension}`;
    const accessToken = await getTeacherAccessToken(request, workspace.teacher);
    const uploaded = await uploadObservationFile({
      accessToken,
      folderId: workspace.classRecord.driveFolderId,
      classId: workspace.classRecord.id,
      fileName,
      contentType: image.contentType,
      bytes,
      metadata: {
        schemaVersion: 1,
        studentNumber: input.studentNumber,
        studentName: input.studentName,
        observedAt: input.observedAt,
        memo: input.memo,
        status: "visible",
        requestId: input.requestId,
        createdAt,
      },
    });
    uploadedFileId = uploaded.id;

    try {
      await insertReceipt({
        requestId: input.requestId,
        classId: session.classId,
        sessionId: session.sid,
        driveFileId: uploaded.id,
        status: "visible",
        createdAt,
      });
    } catch (error) {
      await deleteDriveFile(accessToken, uploaded.id).catch((cleanupError) => {
        console.warn("Drive upload rollback failed", cleanupError);
      });
      uploadedFileId = null;
      const raced = await getReceipt(input.requestId);
      if (raced && raced.classId === session.classId && raced.sessionId === session.sid) {
        return json({ ok: true, id: raced.driveFileId, message: "이미 제출된 사진입니다." });
      }
      throw error;
    }

    return json(
      { ok: true, id: uploaded.id, message: "선생님의 Google Drive에 달 관찰 사진을 제출했습니다." },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedFileId) console.warn("Submission failed after Drive upload", uploadedFileId);
    const driveMessage = googleDriveUserMessage(error);
    return driveMessage ? json({ message: driveMessage }, { status: 503 }) : errorResponse(error);
  }
}

function normalizePageToken(value: string | null) {
  if (!value) return null;
  if (value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HttpError(400, "갤러리 이어보기 정보가 올바르지 않습니다.");
  }
  return value;
}
