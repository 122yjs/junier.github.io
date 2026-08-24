import { env } from "cloudflare:workers";

export interface AppEnv {
  DB: D1Database;
  BUCKET?: R2Bucket;
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  PUBLIC_ORIGIN?: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  origin: string;
  redirectUri: string;
}

export function getEnv(): AppEnv {
  const runtime = env as unknown as Partial<AppEnv>;
  if (!runtime.DB) throw new Error("필수 서버 설정 DB가 없습니다.");
  if (!runtime.SESSION_SECRET || runtime.SESSION_SECRET.length < 32) {
    throw new Error("필수 서버 설정 SESSION_SECRET은 32자 이상이어야 합니다.");
  }
  return runtime as AppEnv;
}

export function isGoogleOAuthConfigured(runtime = getEnv()) {
  return Boolean(runtime.GOOGLE_CLIENT_ID && runtime.GOOGLE_CLIENT_SECRET);
}

export function getGoogleOAuthConfig(request: Request, runtime = getEnv()): GoogleOAuthConfig {
  if (!runtime.GOOGLE_CLIENT_ID || !runtime.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth 설정이 완료되지 않았습니다.");
  }
  const requestOrigin = new URL(request.url).origin;
  const origin = normalizeOrigin(runtime.PUBLIC_ORIGIN || requestOrigin);
  return {
    clientId: runtime.GOOGLE_CLIENT_ID,
    clientSecret: runtime.GOOGLE_CLIENT_SECRET,
    origin,
    redirectUri: `${origin}/api/oauth/google/callback`,
  };
}

export function getTokenEncryptionSecret(runtime = getEnv()) {
  const secret = runtime.TOKEN_ENCRYPTION_KEY?.trim() || runtime.SESSION_SECRET;
  if (secret.length < 32) throw new Error("토큰 암호화 비밀값은 32자 이상이어야 합니다.");
  return secret;
}

export function getPublicOrigin(request: Request, runtime = getEnv()) {
  return normalizeOrigin(runtime.PUBLIC_ORIGIN || new URL(request.url).origin);
}

function normalizeOrigin(value: string) {
  const url = new URL(value);
  return url.origin;
}
