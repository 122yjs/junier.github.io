import { getTeacherSession } from "../../../../../lib/auth";
import {
  assertObservationBelongsToClass,
  deleteDriveFile,
  getDriveFile,
  getTeacherAccessToken,
  googleDriveUserMessage,
  parseObservationMetadata,
  updateDriveFile,
} from "../../../../../lib/google-drive";
import { assertSameOrigin, errorResponse, HttpError, json } from "../../../../../lib/http";
import {
  deleteReceiptByDriveFileId,
  getReceipt,
  getTeacherWorkspace,
  updateReceiptStatus,
} from "../../../../../lib/tenants";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await getTeacherSession(request);
    if (!session) throw new HttpError(401, "교사 로그인 후 이용해 주세요.");
    const { id: requestId } = await context.params;
    if (!REQUEST_ID.test(requestId)) throw new HttpError(404, "관찰 기록을 찾을 수 없습니다.");
    const payload = (await request.json()) as { status?: unknown };
    if (payload.status !== "visible" && payload.status !== "hidden") {
      throw new HttpError(400, "공개 상태가 올바르지 않습니다.");
    }

    const [workspace, receipt] = await Promise.all([
      getTeacherWorkspace(session.teacherId),
      getReceipt(requestId),
    ]);
    if (!workspace || !receipt || receipt.classId !== workspace.classRecord.id) {
      throw new HttpError(404, "관찰 기록을 찾을 수 없습니다.");
    }
    const accessToken = await getTeacherAccessToken(request, workspace.teacher);
    const file = await getDriveFile(accessToken, receipt.driveFileId);
    assertObservationBelongsToClass(file, workspace.classRecord.driveFolderId, workspace.classRecord.id);
    const metadata = parseObservationMetadata(file);
    if (!metadata || metadata.requestId !== requestId) {
      throw new HttpError(404, "관찰 기록 정보를 읽을 수 없습니다.");
    }
    if (metadata.status === payload.status) return json({ ok: true, status: payload.status });

    const nextMetadata = { ...metadata, status: payload.status };
    await updateDriveFile(accessToken, receipt.driveFileId, {
      description: JSON.stringify(nextMetadata),
      appProperties: { ...file.appProperties, status: payload.status },
    });
    try {
      await updateReceiptStatus(workspace.classRecord.id, receipt.driveFileId, payload.status);
    } catch (error) {
      await updateDriveFile(accessToken, receipt.driveFileId, {
        description: JSON.stringify(metadata),
        appProperties: { ...file.appProperties, status: metadata.status },
      }).catch((rollbackError) => console.warn("Drive status rollback failed", rollbackError));
      throw error;
    }
    return json({
      ok: true,
      status: payload.status,
      message: payload.status === "visible" ? "학생 갤러리에 다시 공개했습니다." : "학생 갤러리에서 숨겼습니다.",
    });
  } catch (error) {
    const driveMessage = googleDriveUserMessage(error);
    return driveMessage ? json({ message: driveMessage }, { status: 503 }) : errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const session = await getTeacherSession(request);
    if (!session) throw new HttpError(401, "교사 로그인 후 이용해 주세요.");
    const { id: requestId } = await context.params;
    if (!REQUEST_ID.test(requestId)) throw new HttpError(404, "관찰 기록을 찾을 수 없습니다.");
    const [workspace, receipt] = await Promise.all([
      getTeacherWorkspace(session.teacherId),
      getReceipt(requestId),
    ]);
    if (!workspace || !receipt || receipt.classId !== workspace.classRecord.id) {
      throw new HttpError(404, "관찰 기록을 찾을 수 없습니다.");
    }
    const accessToken = await getTeacherAccessToken(request, workspace.teacher);
    const file = await getDriveFile(accessToken, receipt.driveFileId);
    assertObservationBelongsToClass(file, workspace.classRecord.driveFolderId, workspace.classRecord.id);
    await deleteDriveFile(accessToken, receipt.driveFileId);
    await deleteReceiptByDriveFileId(workspace.classRecord.id, receipt.driveFileId).catch((cleanupError) => {
      console.warn("Submission receipt cleanup failed", cleanupError);
    });
    return json({ ok: true, message: "Google Drive에서 관찰 기록을 완전히 삭제했습니다." });
  } catch (error) {
    const driveMessage = googleDriveUserMessage(error);
    return driveMessage ? json({ message: driveMessage }, { status: 503 }) : errorResponse(error);
  }
}
