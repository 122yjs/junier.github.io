import {
  clearOAuthStateCookie,
  consumeOAuthState,
  createTeacherCookie,
} from "../../../../../lib/auth";
import { encryptString, randomToken, sha256Hex } from "../../../../../lib/crypto";
import {
  createDriveFolder,
  exchangeAuthorizationCode,
  getDriveFile,
  getGoogleUserInfo,
  GoogleApiError,
} from "../../../../../lib/google-drive";
import { getTokenEncryptionSecret } from "../../../../../lib/runtime";
import {
  getClassByTeacherId,
  getTeacherByGoogleSub,
  insertClass,
  insertTeacher,
  updateClass,
  updateTeacher,
  type ClassRecord,
  type TeacherRecord,
} from "../../../../../lib/tenants";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = await consumeOAuthState(request, url.searchParams.get("state"));
  if (!returnTo) return redirectWithMessage(request, "Google 연결 요청이 만료되었습니다. 다시 시도해 주세요.");
  if (url.searchParams.get("error")) {
    return redirectWithMessage(request, "Google Drive 연결이 취소되었습니다.", returnTo);
  }
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) {
    return redirectWithMessage(request, "Google 연결 응답이 올바르지 않습니다.", returnTo);
  }

  try {
    const tokens = await exchangeAuthorizationCode(request, code);
    if (!tokens.access_token) throw new Error("Google access token을 받지 못했습니다.");
    const user = await getGoogleUserInfo(tokens.access_token);
    if (!user.sub || !user.email || user.email_verified === false) {
      throw new Error("확인된 Google 계정 이메일이 없습니다.");
    }

    const existing = await getTeacherByGoogleSub(user.sub);
    const encryptedRefreshToken = tokens.refresh_token
      ? await encryptString(tokens.refresh_token, getTokenEncryptionSecret())
      : existing?.encryptedRefreshToken;
    if (!encryptedRefreshToken) {
      throw new Error("Google의 장기 연결 권한을 받지 못했습니다. 다시 연결해 주세요.");
    }

    const now = new Date().toISOString();
    let teacher: TeacherRecord;
    let classRecord: ClassRecord | null;

    if (existing) {
      const rootFolderId = await ensureFolder(
        tokens.access_token,
        existing.rootFolderId,
        "공주 달 관찰 탐험대",
      );
      teacher = await updateTeacher({
        ...existing,
        email: user.email,
        displayName: user.name?.trim() || user.email,
        encryptedRefreshToken,
        rootFolderId,
        updatedAt: now,
      });
      classRecord = await getClassByTeacherId(existing.id);
      if (classRecord) {
        const driveFolderId = await ensureFolder(
          tokens.access_token,
          classRecord.driveFolderId,
          classRecord.label,
          rootFolderId,
        );
        if (driveFolderId !== classRecord.driveFolderId) {
          classRecord = await updateClass({ ...classRecord, driveFolderId, updatedAt: now });
        }
      } else {
        classRecord = await createInitialClass(tokens.access_token, teacher.id, rootFolderId, now);
      }
    } else {
      const rootFolder = await createDriveFolder(tokens.access_token, "공주 달 관찰 탐험대");
      teacher = await insertTeacher({
        id: crypto.randomUUID(),
        googleSub: user.sub,
        email: user.email,
        displayName: user.name?.trim() || user.email,
        encryptedRefreshToken,
        rootFolderId: rootFolder.id,
        createdAt: now,
        updatedAt: now,
      });
      classRecord = await createInitialClass(tokens.access_token, teacher.id, teacher.rootFolderId, now);
    }

    if (!classRecord) throw new Error("학급 제출함을 만들지 못했습니다.");
    return redirectWithSession(request, returnTo, await createTeacherCookie(teacher.id));
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    const message = error instanceof GoogleApiError
      ? "Google Drive 폴더를 준비하지 못했습니다. 잠시 후 다시 연결해 주세요."
      : error instanceof Error
        ? error.message
        : "Google Drive 연결을 완료하지 못했습니다.";
    return redirectWithMessage(request, message, returnTo);
  }
}

async function createInitialClass(
  accessToken: string,
  teacherId: string,
  rootFolderId: string,
  now: string,
) {
  const label = "4학년 1반";
  const folder = await createDriveFolder(accessToken, label, rootFolderId);
  const inviteToken = randomToken(32);
  return insertClass({
    id: crypto.randomUUID(),
    teacherId,
    label,
    inviteTokenHash: await sha256Hex(inviteToken),
    encryptedInviteToken: await encryptString(inviteToken, getTokenEncryptionSecret()),
    driveFolderId: folder.id,
    galleryEnabled: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureFolder(
  accessToken: string,
  folderId: string,
  name: string,
  parentId?: string,
) {
  try {
    const file = await getDriveFile(accessToken, folderId);
    if (
      file.mimeType === "application/vnd.google-apps.folder" &&
      file.appProperties?.app === "gongju-moon-observation"
    ) return folderId;
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
  }
  return (await createDriveFolder(accessToken, name, parentId)).id;
}

function redirectWithSession(request: Request, returnTo: string, sessionCookie: string) {
  const target = new URL(returnTo, request.url);
  target.searchParams.set("connected", "1");
  const headers = new Headers({ Location: target.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", sessionCookie);
  headers.append("Set-Cookie", clearOAuthStateCookie());
  return new Response(null, { status: 302, headers });
}

function redirectWithMessage(request: Request, message: string, returnTo = "/admin") {
  const target = new URL(returnTo, request.url);
  target.searchParams.set("error", message.slice(0, 240));
  const headers = new Headers({ Location: target.toString(), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearOAuthStateCookie());
  return new Response(null, { status: 302, headers });
}
