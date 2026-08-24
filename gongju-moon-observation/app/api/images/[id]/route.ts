import { getStudentSession, getTeacherSession } from "../../../../lib/auth";
import {
  assertObservationBelongsToClass,
  downloadDriveFile,
  getDriveFile,
  getTeacherAccessToken,
  googleDriveUserMessage,
  parseObservationMetadata,
} from "../../../../lib/google-drive";
import { errorResponse, HttpError, json } from "../../../../lib/http";
import { getClassAndTeacher, getReceipt, getTeacherWorkspace } from "../../../../lib/tenants";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: requestId } = await context.params;
    if (!REQUEST_ID.test(requestId)) throw new HttpError(404, "사진을 찾을 수 없습니다.");
    const receipt = await getReceipt(requestId);
    if (!receipt) throw new HttpError(404, "사진을 찾을 수 없습니다.");

    const teacherSession = await getTeacherSession(request);
    const studentSession = teacherSession ? null : await getStudentSession(request);
    if (!teacherSession && !studentSession) {
      throw new HttpError(401, "수업 참여 링크 또는 교사 로그인 후 이용해 주세요.");
    }

    const workspace = teacherSession
      ? await getTeacherWorkspace(teacherSession.teacherId)
      : await getClassAndTeacher(studentSession!.classId);
    if (!workspace || receipt.classId !== workspace.classRecord.id) {
      throw new HttpError(404, "사진을 찾을 수 없습니다.");
    }

    const accessToken = await getTeacherAccessToken(request, workspace.teacher);
    const file = await getDriveFile(accessToken, receipt.driveFileId);
    assertObservationBelongsToClass(
      file,
      workspace.classRecord.driveFolderId,
      workspace.classRecord.id,
    );
    const metadata = parseObservationMetadata(file);
    if (!metadata || metadata.requestId !== requestId) {
      throw new HttpError(404, "사진 정보를 읽을 수 없습니다.");
    }
    if (studentSession && (!workspace.classRecord.galleryEnabled || metadata.status !== "visible")) {
      throw new HttpError(404, "사진을 찾을 수 없습니다.");
    }

    const driveResponse = await downloadDriveFile(accessToken, receipt.driveFileId);
    const headers = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": file.mimeType || driveResponse.headers.get("Content-Type") || "application/octet-stream",
      "Content-Disposition": "inline",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    });
    const contentLength = driveResponse.headers.get("Content-Length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(driveResponse.body, { status: 200, headers });
  } catch (error) {
    const driveMessage = googleDriveUserMessage(error);
    return driveMessage ? json({ message: driveMessage }, { status: 503 }) : errorResponse(error);
  }
}
