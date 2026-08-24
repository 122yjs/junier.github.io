import { decryptString } from "./crypto";
import { HttpError } from "./http";
import { getGoogleOAuthConfig, getTokenEncryptionSecret } from "./runtime";
import type { TeacherRecord } from "./tenants";

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

export interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export interface DriveObservationMetadata {
  schemaVersion: 1;
  studentNumber: number;
  studentName: string;
  observedAt: string;
  memo: string;
  status: "visible" | "hidden";
  requestId: string;
  createdAt: string;
}

export interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  description?: string;
  parents?: string[];
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  appProperties?: Record<string, string>;
}

export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
  }
}

export function buildGoogleAuthorizationUrl(request: Request, state: string) {
  const config = getGoogleOAuthConfig(request);
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ["openid", "email", DRIVE_FILE_SCOPE].join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeAuthorizationCode(request: Request, code: string) {
  const config = getGoogleOAuthConfig(request);
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const tokens = await googleJson<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  assertOnlyDriveFileScope(tokens.scope);
  return tokens;
}

export async function refreshGoogleAccessToken(request: Request, refreshToken: string) {
  const config = getGoogleOAuthConfig(request);
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });
  return googleJson<GoogleTokenResponse>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function revokeGoogleToken(token: string) {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok && response.status !== 400) throw await googleError(response);
}

export async function getGoogleUserInfo(accessToken: string) {
  return googleJson<GoogleUserInfo>(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function getTeacherAccessToken(request: Request, teacher: TeacherRecord) {
  let refreshToken: string;
  try {
    refreshToken = await decryptString(teacher.encryptedRefreshToken, getTokenEncryptionSecret());
  } catch {
    throw new HttpError(503, "Google Drive 연결 정보를 읽지 못했습니다. 선생님이 다시 연결해 주세요.");
  }
  try {
    const tokens = await refreshGoogleAccessToken(request, refreshToken);
    if (!tokens.access_token) throw new Error("Google access token missing");
    return tokens.access_token;
  } catch (error) {
    if (error instanceof GoogleApiError && (error.status === 400 || error.status === 401)) {
      throw new HttpError(503, "선생님의 Google Drive 연결이 만료되었습니다. 관리 화면에서 다시 연결해 주세요.");
    }
    throw error;
  }
}

export async function createDriveFolder(accessToken: string, name: string, parentId?: string) {
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("fields", "id,name,webViewLink");
  const file = await googleJson<DriveFile>(url.toString(), {
    method: "POST",
    headers: driveJsonHeaders(accessToken),
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
      appProperties: { app: "gongju-moon-observation", kind: "folder" },
    }),
  });
  if (!file.id) throw new GoogleApiError(502, "Google Drive 폴더 ID를 받지 못했습니다.");
  return file;
}

export async function uploadObservationFile(input: {
  accessToken: string;
  folderId: string;
  classId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  metadata: DriveObservationMetadata;
}) {
  const boundary = `moon_${crypto.randomUUID().replace(/-/g, "")}`;
  const driveMetadata = {
    name: input.fileName,
    parents: [input.folderId],
    mimeType: input.contentType,
    description: JSON.stringify(input.metadata),
    appProperties: {
      app: "gongju-moon-observation",
      kind: "observation",
      classId: input.classId,
      requestId: input.metadata.requestId,
      status: input.metadata.status,
    },
  };
  const binary = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(driveMetadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${input.contentType}\r\n\r\n`,
    binary,
    `\r\n--${boundary}--`,
  ]);
  const url = new URL(DRIVE_UPLOAD_URL);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set(
    "fields",
    "id,name,mimeType,description,parents,size,createdTime,webViewLink,appProperties",
  );
  const file = await googleJson<DriveFile>(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!file.id) throw new GoogleApiError(502, "Google Drive 파일 ID를 받지 못했습니다.");
  return file;
}

export async function listObservationFiles(input: {
  accessToken: string;
  folderId: string;
  classId: string;
  pageToken?: string | null;
  pageSize?: number;
  visibleOnly?: boolean;
}) {
  const query = [
    `'${escapeDriveQuery(input.folderId)}' in parents`,
    "trashed = false",
    "appProperties has { key='app' and value='gongju-moon-observation' }",
    "appProperties has { key='kind' and value='observation' }",
    `appProperties has { key='classId' and value='${escapeDriveQuery(input.classId)}' }`,
  ];
  if (input.visibleOnly) {
    query.push("appProperties has { key='status' and value='visible' }");
  }
  const url = new URL(DRIVE_FILES_URL);
  url.searchParams.set("q", query.join(" and "));
  url.searchParams.set("spaces", "drive");
  url.searchParams.set("orderBy", "createdTime desc");
  url.searchParams.set("pageSize", String(Math.min(100, Math.max(1, input.pageSize || 30))));
  url.searchParams.set(
    "fields",
    "nextPageToken,files(id,name,mimeType,description,parents,size,createdTime,modifiedTime,webViewLink,thumbnailLink,appProperties)",
  );
  if (input.pageToken) url.searchParams.set("pageToken", input.pageToken);
  return googleJson<{ files?: DriveFile[]; nextPageToken?: string }>(url.toString(), {
    headers: { Authorization: `Bearer ${input.accessToken}` },
  });
}

export async function getDriveFile(accessToken: string, fileId: string) {
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`);
  url.searchParams.set(
    "fields",
    "id,name,mimeType,description,parents,size,createdTime,webViewLink,appProperties",
  );
  return googleJson<DriveFile>(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function downloadDriveFile(accessToken: string, fileId: string) {
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw await googleError(response);
  return response;
}

export async function updateDriveFile(
  accessToken: string,
  fileId: string,
  patch: Record<string, unknown>,
) {
  const url = new URL(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", "id,name,description,appProperties,webViewLink");
  return googleJson<DriveFile>(url.toString(), {
    method: "PATCH",
    headers: driveJsonHeaders(accessToken),
    body: JSON.stringify(patch),
  });
}

export async function deleteDriveFile(accessToken: string, fileId: string) {
  const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) throw await googleError(response);
}

export function parseObservationMetadata(file: DriveFile): DriveObservationMetadata | null {
  if (!file.description) return null;
  try {
    const value = JSON.parse(file.description) as Partial<DriveObservationMetadata>;
    if (
      value.schemaVersion !== 1 ||
      !Number.isInteger(value.studentNumber) ||
      typeof value.studentName !== "string" ||
      typeof value.observedAt !== "string" ||
      typeof value.memo !== "string" ||
      (value.status !== "visible" && value.status !== "hidden") ||
      typeof value.requestId !== "string" ||
      typeof value.createdAt !== "string"
    ) {
      return null;
    }
    return value as DriveObservationMetadata;
  } catch {
    return null;
  }
}

export function assertObservationBelongsToClass(file: DriveFile, folderId: string, classId: string) {
  if (
    !file.parents?.includes(folderId) ||
    file.appProperties?.app !== "gongju-moon-observation" ||
    file.appProperties?.kind !== "observation" ||
    file.appProperties?.classId !== classId
  ) {
    throw new HttpError(404, "관찰 기록을 찾을 수 없습니다.");
  }
}

export function googleDriveUserMessage(error: unknown) {
  if (!(error instanceof GoogleApiError)) return null;
  if (error.reason === "storageQuotaExceeded") {
    return "선생님의 Google Drive 저장공간이 부족합니다. 저장공간을 정리한 뒤 다시 시도해 주세요.";
  }
  if (error.status === 403 || error.status === 429) {
    return "Google Drive 요청이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error.status >= 500) {
    return "Google Drive가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.";
  }
  return null;
}

function assertOnlyDriveFileScope(scope: string | undefined) {
  if (!scope) return;
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  if (!granted.has(DRIVE_FILE_SCOPE)) {
    throw new GoogleApiError(403, "Google Drive 파일 권한이 승인되지 않았습니다.");
  }
  const unexpectedDriveScope = [...granted].find(
    (value) => value.startsWith("https://www.googleapis.com/auth/drive") && value !== DRIVE_FILE_SCOPE,
  );
  if (unexpectedDriveScope) {
    throw new GoogleApiError(403, "허용 범위를 넘는 Google Drive 권한이 포함되어 연결을 중단했습니다.");
  }
}

function driveJsonHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=utf-8",
  };
}

async function googleJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  if (!response.ok) throw await googleError(response);
  return (await response.json()) as T;
}

async function googleError(response: Response) {
  const text = await response.text();
  let message = `Google API 요청에 실패했습니다. (${response.status})`;
  let reason: string | undefined;
  try {
    const payload = JSON.parse(text) as {
      error?: string | { message?: string; errors?: Array<{ reason?: string }> };
      error_description?: string;
    };
    if (typeof payload.error === "string") {
      reason = payload.error;
      message = payload.error_description || payload.error;
    } else if (payload.error) {
      message = payload.error.message || message;
      reason = payload.error.errors?.[0]?.reason;
    }
  } catch {
    if (text.trim()) message = text.slice(0, 300);
  }
  return new GoogleApiError(response.status, message, reason);
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
