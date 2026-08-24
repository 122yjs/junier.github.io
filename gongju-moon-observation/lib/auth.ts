import { randomToken, signPayload, verifyPayload } from "./crypto";
import { getEnv } from "./runtime";

const STUDENT_COOKIE = "moon_class_session";
const TEACHER_COOKIE = "moon_teacher_session";
const OAUTH_STATE_COOKIE = "moon_google_oauth_state";
export const STUDENT_SESSION_MAX_AGE = 60 * 24 * 60 * 60;
const TEACHER_SESSION_MAX_AGE = 12 * 60 * 60;
const OAUTH_STATE_MAX_AGE = 10 * 60;

export interface StudentSession {
  role: "student";
  classId: string;
  sid: string;
  exp: number;
}

export interface TeacherSession {
  role: "teacher";
  teacherId: string;
  sid: string;
  exp: number;
}

interface OAuthStatePayload {
  state: string;
  returnTo: string;
  exp: number;
}

export async function createStudentCookie(classId: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: StudentSession = {
    role: "student",
    classId,
    sid: crypto.randomUUID(),
    exp: now + STUDENT_SESSION_MAX_AGE,
  };
  return cookie(STUDENT_COOKIE, await signPayload(payload, getEnv().SESSION_SECRET), STUDENT_SESSION_MAX_AGE);
}

export async function createTeacherCookie(teacherId: string) {
  const now = Math.floor(Date.now() / 1000);
  const payload: TeacherSession = {
    role: "teacher",
    teacherId,
    sid: crypto.randomUUID(),
    exp: now + TEACHER_SESSION_MAX_AGE,
  };
  return cookie(TEACHER_COOKIE, await signPayload(payload, getEnv().SESSION_SECRET), TEACHER_SESSION_MAX_AGE);
}

export async function createOAuthState(returnTo = "/admin") {
  const state = randomToken(24);
  const payload: OAuthStatePayload = {
    state,
    returnTo: safeRelativeReturnPath(returnTo),
    exp: Math.floor(Date.now() / 1000) + OAUTH_STATE_MAX_AGE,
  };
  return {
    state,
    setCookie: cookie(
      OAUTH_STATE_COOKIE,
      await signPayload(payload, getEnv().SESSION_SECRET),
      OAUTH_STATE_MAX_AGE,
    ),
  };
}

export async function consumeOAuthState(request: Request, state: string | null) {
  const payload = await verifyPayload<OAuthStatePayload>(
    readCookie(request, OAUTH_STATE_COOKIE),
    getEnv().SESSION_SECRET,
  );
  if (!state || !payload || payload.state !== state || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload.returnTo;
}

export async function getStudentSession(request: Request) {
  const payload = await verifyPayload<StudentSession>(
    readCookie(request, STUDENT_COOKIE),
    getEnv().SESSION_SECRET,
  );
  if (
    !payload ||
    payload.role !== "student" ||
    !payload.classId ||
    !payload.sid ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return payload;
}

export async function getTeacherSession(request: Request) {
  const payload = await verifyPayload<TeacherSession>(
    readCookie(request, TEACHER_COOKIE),
    getEnv().SESSION_SECRET,
  );
  if (
    !payload ||
    payload.role !== "teacher" ||
    !payload.teacherId ||
    !payload.sid ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }
  return payload;
}

export async function getViewerSession(request: Request) {
  return (await getTeacherSession(request)) || (await getStudentSession(request));
}

export function clearStudentCookie() {
  return cookie(STUDENT_COOKIE, "", 0);
}

export function clearTeacherCookie() {
  return cookie(TEACHER_COOKIE, "", 0);
}

export function clearOAuthStateCookie() {
  return cookie(OAUTH_STATE_COOKIE, "", 0);
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return null;
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function safeRelativeReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/admin";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return "/admin";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/admin";
  }
}
