# 공주 달 관찰 탐험대 — 중앙 Google Drive OAuth형

공주시 초등 과학 수업용 달 관찰 웹앱입니다. 여러 비개발자 교사가 하나의 중앙 서비스에 접속해 자신의 Google Drive를 연결하고, 학생은 교사가 제공한 QR로 로그인 없이 사진과 관찰 기록을 제출합니다.

## 핵심 구조

```text
교사 브라우저
  └─ Google OAuth (openid + email + drive.file)
        └─ 교사별 앱 전용 Drive 폴더 자동 생성

학생 브라우저
  └─ 교사별 QR → 60일 수업 세션
        └─ 중앙 Worker가 사진을 검증·메타데이터 제거
              └─ 해당 교사의 Google Drive에 직접 저장
```

### 중앙 D1에 저장하는 정보

- 교사 Google 계정 식별자, 이메일, 표시 이름
- 암호화된 Google refresh token
- 교사별 Drive 폴더 ID
- 학급명, 갤러리 설정, 암호화된 수업 초대 토큰
- 중복 제출·요청 제한에 필요한 비식별 영수증
  - 요청 UUID
  - 학급 UUID
  - 무작위 학생 세션 UUID
  - Google Drive 파일 ID
  - 공개/숨김 상태
  - 생성 시각

### 중앙 D1에 새로 저장하지 않는 정보

- 학생 이름
- 학생 번호
- 학생 관찰 메모
- 학생 관찰 시각
- 학생 사진 또는 썸네일

학생 정보는 교사의 Google Drive 사진 파일 `description`에 JSON 메타데이터로 저장됩니다. 사진 파일 이름에는 학생 이름이나 번호를 넣지 않습니다. 이전 D1/R2 버전의 `observations` 테이블과 기존 파일은 배포 중 임의 삭제하지 않지만, 새 API는 더 이상 해당 저장소에 쓰거나 읽지 않습니다.

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

## 학생 UX

1. 교사의 QR을 촬영합니다.
2. 계정 로그인 없이 60일 수업 세션을 받습니다.
3. 번호·이름·관찰 시각·메모와 사진을 제출합니다.
4. 교사가 갤러리를 켠 경우 마스킹된 이름으로 같은 학급의 사진을 봅니다.

## 환경 변수와 Secret

실제 값은 GitHub에 커밋하지 않습니다.

| 이름 | 필수 | 용도 |
|---|---:|---|
| `SESSION_SECRET` | 예 | 학생·교사·OAuth state 쿠키 서명. 32자 이상 |
| `TOKEN_ENCRYPTION_KEY` | 권장 | refresh token AES-GCM 암호화. 32자 이상. 없으면 `SESSION_SECRET` 사용 |
| `GOOGLE_CLIENT_ID` | 예 | Google OAuth 웹 애플리케이션 Client ID |
| `GOOGLE_CLIENT_SECRET` | 예 | Google OAuth Client Secret |
| `PUBLIC_ORIGIN` | 운영 권장 | 운영 origin. 예: `https://classroom-webapp-2026.znr1.chatgpt.site` |

기존 `CLASS_INVITE_TOKEN`, `ADMIN_PASSWORD_HASH`, `CLASS_ID`, `CLASS_LABEL`은 중앙 다중 교사 구조에서 더 이상 사용하지 않습니다.

## Google Cloud Console 설정

1. Google Cloud 프로젝트에서 Google Drive API를 사용 설정합니다.
2. OAuth 동의 화면에 앱 이름, 지원 이메일, 홈페이지, 개인정보처리방침을 설정합니다.
3. 범위는 `openid`, `email`, `drive.file`만 등록합니다.
4. **웹 애플리케이션** OAuth Client를 만듭니다.
5. 승인된 JavaScript origin에 운영 origin을 등록합니다.
6. 승인된 리디렉션 URI에 다음을 정확히 등록합니다.

```text
https://classroom-webapp-2026.znr1.chatgpt.site/api/oauth/google/callback
```

커스텀 도메인을 쓰면 해당 도메인의 `/api/oauth/google/callback`도 추가합니다. 개인정보 처리방침 URL은 `/privacy`, 서비스 이용 안내 URL은 `/terms`입니다.

## 데이터베이스 마이그레이션

새 테이블은 `drizzle/0001_central_drive_oauth.sql`에 정의되어 있습니다.

```text
teachers
classes
submission_receipts
```

배포 환경에서 D1 원격 마이그레이션을 적용한 뒤 OAuth 연결을 시작해야 합니다.

## 개발 명령

```bash
npm run install:ci
npm run lint
npm test
```

- `npm run build:static`: 학생 화면용 정적 CSS 생성
- `npm run build`: Vinext/Cloudflare Worker 빌드
- `npm test`: 빌드 후 OAuth 범위·Drive 저장·D1 비식별화·학생 UI 회귀 검사

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
