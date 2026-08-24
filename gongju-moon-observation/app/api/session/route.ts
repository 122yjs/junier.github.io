import {
  clearStudentCookie,
  createStudentCookie,
  getStudentSession,
} from "../../../lib/auth";
import { sha256Hex } from "../../../lib/crypto";
import { assertSameOrigin, errorResponse, HttpError, json } from "../../../lib/http";
import { getClassById, getClassByInviteHash } from "../../../lib/tenants";

export async function GET(request: Request) {
  try {
    const session = await getStudentSession(request);
    if (!session) {
      return json({ authenticated: false, classLabel: null, galleryEnabled: false });
    }
    const classRecord = await getClassById(session.classId);
    if (!classRecord) {
      return json(
        { authenticated: false, classLabel: null, galleryEnabled: false },
        { headers: { "Set-Cookie": clearStudentCookie() } },
      );
    }
    return json({
      authenticated: true,
      classLabel: classRecord.label,
      galleryEnabled: classRecord.galleryEnabled,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = (await request.json()) as { token?: unknown };
    if (typeof payload.token !== "string" || payload.token.length < 32 || payload.token.length > 256) {
      throw new HttpError(401, "유효하지 않거나 만료된 수업 참여 링크입니다.");
    }
    const classRecord = await getClassByInviteHash(await sha256Hex(payload.token));
    if (!classRecord) {
      throw new HttpError(401, "유효하지 않거나 만료된 수업 참여 링크입니다.");
    }
    return json(
      {
        ok: true,
        classLabel: classRecord.label,
        galleryEnabled: classRecord.galleryEnabled,
      },
      { headers: { "Set-Cookie": await createStudentCookie(classRecord.id) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    return json({ ok: true }, { headers: { "Set-Cookie": clearStudentCookie() } });
  } catch (error) {
    return errorResponse(error);
  }
}
