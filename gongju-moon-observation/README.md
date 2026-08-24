# 공주 달 관찰 탐험대 — 중앙 Google Drive OAuth형

공주시 초등 과학 수업용 달 관찰 웹앱입니다. 여러 비개발자 교사가 하나의 중앙 서비스에 접속해 자신의 Google Drive를 연결하고, 학생은 교사가 제공한 QR로 로그인 없이 사진과 관찰 기록을 제출합니다.

> 운영 배포 대상은 **소유한 커스텀 도메인에 연결한 Cloudflare Worker**입니다. ChatGPT Sites는 13세 미만 아동을 대상으로 하는 사이트를 허용하지 않으므로 학생 운영 주소로 사용하지 않습니다. `.openai/hosting.json`은 기존 개발 이력과 로컬 호환을 위해 남아 있지만 새 운영 배포에는 사용하지 않습니다.

## 핵심 구조

```text
교사 브라우저
  └─ Google OAuth (openid + email + drive.file)
        └─ 교사별 앱 전용 Drive 폴더 자동 생성

학생 브라우저
  └─ 교사별 QR → 60일 수업 세션
        └─ 중앙 Cloudflare Worker가 사진 검증·메타데이터 제거
              └─ 해당 교사의 Google Drive에 직접 저장

중앙 Cloudflare D1
  └─ 교사 연결·학급 라우팅·비식별 제출 영수증만 저장
```

## 중앙 저장 원칙

### 중앙 D1에 저장하는 정보

- 교사 Google 계정 식별자, 이메일, 표시 이름
- AES-GCM으로 암호화한 Google refresh token
- 교사별 Drive 폴더 ID
- 학급명, 갤러리 설정, 암호화된 수업 초대 토큰
- 중복 제출·요청 제한에 필요한 비식별 영수증
  - 요청 UUID
  - 학급 UUID
  - 무작위 학생 세션 UUID
  - Google Drive 파일 ID
  - 공개/숨김 상태
  - 생성 시각

### 중앙 D1/R2에 새로 저장하지 않는 정보

- 학생 이름
- 학생 번호
- 학생 관찰 메모
- 학생 관찰 시각
- 학생 사진 또는 썸네일

학생 정보는 교사의 Google Drive 사진 파일 `description`에 JSON 메타데이터로 저장됩니다. 사진 파일 이름에는 학생 이름이나 번호를 넣지 않습니다.

기존 ChatGPT Sites D1/R2 버전의 `observations` 테이블과 과거 파일은 배포 과정에서 임의 삭제하지 않습니다. 새 API는 해당 테이블과 R2에 더 이상 쓰거나 읽지 않습니다. 새 Cloudflare 계정에 배포할 때는 `drizzle-cloudflare/0000_central_drive_oauth.sql`만 적용하므로 학생 개인정보 컬럼이 있는 레거시 테이블 자체가 생성되지 않습니다.

## Google 권한

Drive 관련 권한은 다음 하나만 요청합니다.

```text
https://www.googleapis.com/auth/drive.file
```

교사 계정 식별을 위해 표준 OpenID Connect 범위 `openid email`을 함께 요청합니다. Drive 전체 읽기·쓰기 권한인 `drive`, `drive.readonly` 등은 요청하지 않습니다. `drive.file` 범위에서는 이 앱이 생성한 폴더와 파일만 관리합니다.

## 교사 UX

1. `/admin`에서 **Google Drive 연결하기**를 누릅니다.
2. Google 계정을 선택하고 `drive.file` 권한을 승인합니다.
3. 앱이 `공주 달 관찰 탐험대/4학년 1반` 폴더를 만듭니다.
4. 관리 화면에 표시된 QR을 학생에게 보여 줍니다.
5. 제출 사진은 교사 Drive에 저장되고 관리 화면에서 숨김·삭제할 수 있습니다.
6. 연결 해제 시 중앙 계정·토큰·영수증은 삭제되지만 교사 Drive 파일은 그대로 남습니다.

## 학생 UX

1. 교사의 QR을 촬영합니다.
2. 계정 로그인 없이 60일 수업 세션을 받습니다.
3. 번호·이름·관찰 시각·메모와 사진을 제출합니다.
4. 교사가 갤러리를 켠 경우 마스킹된 이름으로 같은 학급의 사진을 봅니다.

## 운영 배포 구조

직접 Cloudflare 배포 설정은 `wrangler.cloudflare.jsonc`에 있습니다.

```text
Cloudflare Worker
├─ Vinext/Next.js 서버
├─ Static Assets
├─ D1 binding: DB
└─ Custom Domain
```

R2 binding은 사용하지 않습니다. Wrangler의 자동 리소스 프로비저닝을 사용하므로 첫 배포 시 D1이 자동 생성됩니다. 운영 D1 마이그레이션 디렉터리는 `drizzle-cloudflare`입니다.

### GitHub production 환경 값

GitHub 저장소의 **Settings → Environments → production**에 다음 Secret을 등록합니다.

| 이름 | 용도 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 배포할 Cloudflare 계정 ID |
| `CLOUDFLARE_API_TOKEN` | Worker·D1·Custom Domain 배포 권한 토큰 |
| `SESSION_SECRET` | 학생·교사·OAuth state 쿠키 서명. 32자 이상 |
| `TOKEN_ENCRYPTION_KEY` | refresh token AES-GCM 암호화. 32자 이상 |
| `GOOGLE_CLIENT_ID` | Google OAuth 웹 애플리케이션 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |

같은 `production` 환경에 다음 Variable을 등록합니다.

| 이름 | 예시 | 용도 |
|---|---|---|
| `CLOUDFLARE_CUSTOM_DOMAIN` | `moon.example.com` | 프로토콜과 경로를 제외한 운영 호스트명 |

`PUBLIC_ORIGIN`은 배포 workflow가 `https://CLOUDFLARE_CUSTOM_DOMAIN`으로 생성해 Worker Secret으로 주입합니다. 실제 Secret 값은 소스·로그·Wrangler 설정에 기록하지 않습니다.

### Cloudflare API Token 권한

최소한 다음 작업을 수행할 수 있어야 합니다.

- Workers Scripts 편집
- D1 편집
- Workers Routes 또는 Custom Domains 편집
- 대상 Zone 읽기

커스텀 도메인은 같은 Cloudflare 계정에 등록된 Zone의 호스트명이어야 합니다.

## Google Cloud Console 설정

1. 소유한 운영 도메인을 준비하고 HTTPS가 적용될 Cloudflare Zone에 등록합니다.
2. Google Cloud 프로젝트에서 Google Drive API를 사용 설정합니다.
3. OAuth 동의 화면에 앱 이름, 지원 이메일, 홈페이지, 개인정보 처리방침과 이용 안내를 설정합니다.
4. 범위는 `openid`, `email`, `drive.file`만 등록합니다.
5. **웹 애플리케이션** OAuth Client를 만듭니다.
6. 승인된 JavaScript origin에 운영 origin을 등록합니다.
7. 승인된 리디렉션 URI를 정확히 등록합니다.

```text
https://moon.example.com/api/oauth/google/callback
```

운영 문서 URL 예시는 다음과 같습니다.

```text
홈페이지: https://moon.example.com/
개인정보 처리 안내: https://moon.example.com/privacy
이용 안내: https://moon.example.com/terms
```

공개 OAuth 앱의 홈페이지와 정책 문서는 운영자가 소유하고 검증할 수 있는 도메인에 두는 것을 전제로 합니다. `workers.dev`, `chatgpt.site` 같은 제공자 공용 도메인을 공개 서비스의 최종 OAuth 도메인으로 사용하지 않습니다.

## 배포 절차

코드 검증 workflow:

```text
.github/workflows/gongju-moon-observation-ci.yml
```

운영 배포 workflow:

```text
.github/workflows/deploy-gongju-moon-observation-cloudflare.yml
```

운영 Secret·Variable과 Google OAuth 설정을 완료한 뒤 GitHub의 **Actions → Deploy Gongju Moon Observation to Cloudflare → Run workflow**를 실행합니다. Workflow는 다음을 자동 수행합니다.

1. 의존성 설치와 lint
2. 커스텀 도메인용 Wrangler 설정 생성
3. Vinext/Cloudflare Worker 빌드
4. D1 자동 생성과 Worker 배포
5. `drizzle-cloudflare` 원격 마이그레이션 적용
6. Google OAuth·D1 health check
7. 운영 URL 요약 출력

## 기존 Sites D1을 전환하는 경우

기존 Sites D1에 새 테이블을 추가하는 migration은 `drizzle/0001_central_drive_oauth.sql`입니다.

```text
teachers
classes
submission_receipts
```

그러나 초등학생 대상 운영 사이트는 ChatGPT Sites에 새 버전으로 배포하지 않습니다. 이 migration은 기존 데이터 보존·코드 이력과 별도 이전 작업을 위해서만 유지합니다.

## 개발 명령

```bash
npm run install:ci
npm run lint
npm test
```

직접 Cloudflare 대상 빌드:

```bash
CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH=wrangler.cloudflare.jsonc npm run build
node --test tests/cloudflare-deploy.test.mjs
```

- `npm run build:static`: 학생 화면용 정적 CSS 생성
- `npm run build`: Vinext/Cloudflare Worker 빌드
- `npm test`: 기존 화면·OAuth 범위·Drive 저장·D1 비식별화 회귀 검사
- `tests/cloudflare-deploy.test.mjs`: R2 미사용·D1 clean schema·직접 배포 산출물 검사

## 보안 설계

- OAuth state: 서명된 HttpOnly·Secure·SameSite=Lax 쿠키
- 교사·학생 세션: HMAC 서명 HttpOnly 쿠키
- refresh token: AES-GCM 암호화 후 D1 저장
- 사진: 브라우저 압축 후 서버에서 MIME·매직바이트·용량 재검증
- JPEG/PNG/WebP의 EXIF·위치·텍스트 메타데이터 제거
- 학생 갤러리 이름 마스킹
- 요청 UUID 고유 제약으로 중복 저장 방지
- 기기 세션당 10분 3회, 학급당 1시간 100회 제출 제한
- Google Drive 업로드 성공 후 D1 영수증 실패 시 Drive 파일 보상 삭제
- 교사 연결 해제 시 중앙 계정·토큰·영수증 삭제 및 Google 토큰 폐기
- `no-store`, `no-referrer`, `nosniff`, `noindex` 보안 헤더
