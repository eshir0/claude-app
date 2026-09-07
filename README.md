# 사용량 대시보드

> 📘 사용법·설치 방법을 쉽게 정리한 안내서: **https://eshir0.github.io/claude-app/** (또는 `GUIDE.md`)

개인 서버에 배포하는 자체 호스팅 대시보드. 확장 가능한 베이스 위에, 첫 모듈로 ChatGPT
Codex 구독 사용량을 추적하고, 두 번째 모듈로 Proxmox VE 서버(호스트 CPU/메모리/디스크/
CPU·GPU·NVMe 온도, 데이터센터 스토리지, VM·LXC별 CPU/메모리/디스크/네트워크 속도) 상태를
보여준다. `/ai-usage/connections`에서 Codex CLI의 공식 기기 코드(device code) 로그인으로
본인 ChatGPT 계정에 연결하면 서버가 30분마다 자동으로 수집한다 — 수동 입력 기능은 없다
(정확성이 보장되지 않는 수기 입력 대신, 실제로 수집된 값만 신뢰하기로 함). 온도는 Proxmox
API에 없어 SSH + lm-sensors로 별도 수집(선택 기능, GUIDE.md 참고).

Claude Pro는 추적하지 않는다 — Anthropic이 2026-02 Consumer Terms of Service 개정으로
Free/Pro/Max 구독 OAuth 토큰을 Claude Code/claude.ai가 아닌 제3의 도구에서 쓰는 것을
명시적으로 금지했고, 세션 쿠키를 이용한 방식은 Cloudflare 봇 탐지에 막혀 기술적으로도
불가능했다. 자세한 배경은 프로젝트 메모리 참고.

## 기술 스택

Next.js 16.3 (App Router, `proxy.ts`) · React 19 · TypeScript · Prisma 7.10 + SQLite
(better-sqlite3 드라이버 어댑터) · Tailwind CSS v4 · iron-session · Node.js 24

## 로컬 개발

```bash
npm install
cp .env.example .env
npm run hash-password   # 대화형 프롬프트 — 비밀번호를 CLI 인자로 넘기지 않음
# 위 출력값을 .env의 AUTH_PASSWORD_HASH에 붙여넣는다 (아래 "중요" 참고)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # SESSION_SECRET
npx prisma migrate dev
npm run dev
```

`http://localhost:3000` 접속 → `/login`으로 리다이렉트 → 설정한 비밀번호로 로그인.

**중요 — bcrypt 해시의 `$`는 실행 방식마다 다르게 다뤄야 한다.** 두 가지 다른 도구가
`$`를 서로 다른 방식으로 처리하므로, 한쪽에서 맞는 형식을 다른 쪽에 그대로 쓰면 안 된다
(둘 다 실제로 재현·확인함):

- **`npm run dev` / `npm run start:standalone`** (Next.js의 `.env` 로더, `@next/env`
  사용): `$VARIABLE` 형태를 다른 변수 참조로 자동 치환한다. 이스케이프 없이 그대로 넣으면
  `$2b`, `$12` 등을 존재하지 않는 변수로 취급해 값이 통째로 빈 문자열이 되어버린다(앱은
  이 경우 부팅을 거부한다 — "AUTH_PASSWORD_HASH does not look like a bcrypt hash"). 모든
  `$`를 `\$`로 이스케이프해야 한다:
  ```
  AUTH_PASSWORD_HASH=\$2b\$12\$실제해시나머지부분...
  ```
- **`docker compose`** (compose.yaml의 `${VAR}`를 치환하는 자체 인터폴레이션 엔진, 공식 문서
  기준): 값이 **작은따옴표(`'`)로 감싸져 있으면 이스케이프 없이 그대로("literally") 쓴다** —
  Next.js와 반대로 백슬래시를 쓰면 안 된다(백슬래시 자체가 값에 포함되어버린다):
  ```
  AUTH_PASSWORD_HASH='$2b$12$실제해시나머지부분...'
  ```

`npm run hash-password`(대화형)를 실행하면 두 형식을 모두 라벨을 붙여 출력해준다 — 실행
방식에 맞는 줄을 그대로 복사해서 쓰면 된다. **이 둘을 같은 `.env` 파일에 함께 써야 하는
경우는 없어야 한다** — `docker compose`는 기본적으로 `docker-compose.yml`과 같은 위치의
`.env`를 자동으로 읽으므로, 로컬 개발용 `.env`(Next.js 이스케이프 형식)와 같은 파일을
그대로 Docker 배포에도 재사용하면 형식이 맞지 않아 깨진다. 배포용 `.env`는 로컬 개발용과
분리해서 관리한다(예: 별도 디렉터리, 또는 배포 서버 전용 `.env`).

Next.js 쪽 형식은 이 세션에서 직접 실행해 확인했다 — 생성된 해시를 위 형식으로 `.env`에
써서 `@next/env`로 다시 읽은 뒤 원래 비밀번호로 `bcrypt.compare`가 성공하는 것까지 검증함.
Docker Compose 쪽 작은따옴표 규칙은 [공식 문서](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)에
근거했지만, 이 환경에 Docker가 없어 `docker compose` 자체로 실행 재현은 하지 못했다 —
미검증으로 남겨둔다(아래 "검증 상태" 참고).

## 환경변수

`.env.example` 참고. `AUTH_PASSWORD_HASH`, `SESSION_SECRET`, `APP_ORIGIN`, `DATABASE_URL`은
필수 — 하나라도 없거나 형식이 잘못되면 서버가 요청을 받기 전에 스스로 종료한다
(`src/instrumentation.ts` / `src/instrumentation-node.ts`).

## LAN IP 등 `localhost`가 아닌 주소로 접속할 때 로그인이 안 되는 경우

프로덕션 빌드는 세션 쿠키에 `Secure` 플래그를 켠다. 브라우저는 `http://localhost`만
예외적으로 "보안 컨텍스트"로 취급해 평문 HTTP에서도 `Secure` 쿠키를 저장하는데, **LAN
IP(예: `192.168.x.x`)나 다른 호스트명은 이 예외에 해당하지 않는다.** 그 결과: 로그인
요청 자체는 서버에서 성공(200)하지만 브라우저가 응답의 `Set-Cookie`를 조용히 버리고,
바로 다시 `/login`으로 튕겨서 마치 아무 일도 안 일어난 것처럼 보인다.

같은 기기의 다른 브라우저/터미널에서 서버 로그를 확인해보면 로그인 요청이 실제로
200을 반환하는데도 클라이언트에서 계속 미인증으로 리다이렉트된다면 이 문제일 가능성이
크다. 실제 인터넷에 노출하는 배포에는 해당하지 않는 문제이며(그 경우는 HTTPS가
전제이므로 `Secure`가 정상 동작), **LAN/사설망에서 평문 HTTP로 테스트할 때만** `.env`에
아래를 추가한다:

```
FORCE_INSECURE_COOKIES=true
```

## 로그인 시도 제한과 신뢰 가능한 클라이언트 IP

Next.js Route Handler는 실제 접속 IP를 프레임워크 차원에서 노출하지 않는다
(`NextRequest.ip`는 제거됨). 그래서 로그인 시도 제한이 IP별로 정확하려면 배포 구성 자체가
IP를 신뢰 가능하게 만들어줘야 한다:

1. 이 앱의 컨테이너 포트를 인터넷에 직접 노출하지 않는다 (docker-compose의 `ports:`를
   기본적으로 비워둔 이유 — 신뢰하는 리버스 프록시만 이 앱에 닿을 수 있어야 한다).
2. 리버스 프록시(Caddy/nginx 등)가 클라이언트가 보낸 전달 헤더를 무시하고, 실제 접속 주소로
   덮어써서 전달하도록 설정한다 (예: nginx `proxy_set_header X-Forwarded-For $remote_addr;`).
3. 그 구성에서만 `.env`에 `TRUSTED_PROXY=true`와 `CLIENT_IP_HEADER=X-Forwarded-For`를 설정한다.

이 두 값을 설정하지 않으면(기본값), 신뢰할 수 없는 헤더로 제한을 우회하는 대신 **서버
전체(IP 무관) 로그인 제한**으로 대체 동작한다 — 개인용 단일 사용자 앱에 맞는 거친 대안이다.
두 경우 모두 인메모리 상태라 앱 재시작 시 초기화된다(단일 인스턴스 전제, 한계로 인정).

## 알려진 한계 (의도적 설계 선택)

- **세션은 상태 비저장(stateless)이다.** 로그아웃은 브라우저에 쿠키 삭제를 지시할 뿐,
  서버 측 폐기 목록이 없다 — 로그아웃 전에 탈취된 세션 토큰은 자연 만료(12시간)까지
  재생 가능하다. 개인 단일 사용자 앱의 위협 모델에서는 감수 가능한 트레이드오프로 판단했다.
- **로그인 시도 제한은 단일 인스턴스·인메모리**다. 재시작하면 초기화된다.
- **SQLite는 단일 서버·단일 인스턴스 운영을 전제**한다. SQLite 자체는 여러 프로세스의 접근과
  동시 쓰기 직렬화를 지원하지만(공식 FAQ 참고), 네트워크 파일시스템에서는 잠금이 보장되지
  않고, 이 앱은 애초에 수평 확장이 필요 없는 개인용이라 단일 인스턴스로만 운영하도록 설계했다.
- **자동 사용량 수집기는 없다.** `source: MANUAL | AUTO` 필드는 있지만 이번 범위에서 자동
  수집기/스케줄러를 구현하지 않았고, `POST /api/ai-usage`는 클라이언트가 보낸 `source` 값을
  아예 파싱하지 않으므로 외부 요청이 `AUTO`를 자칭할 수 없다. 향후 수집기를 붙이려면 최소
  (a) 재시도 시 중복 방지용 멱등키, (b) 수집 실패/무응답 처리 정책이 추가로 필요하다.

## 배포 (Docker)

```bash
cp .env.example .env   # AUTH_PASSWORD_HASH(위 이스케이프 주의)/SESSION_SECRET/APP_ORIGIN 채우기
docker compose build
docker compose up -d
```

- `output: standalone`(next.config.ts)로 빌드하고, `public/`, `.next/static/`,
  Prisma 생성 클라이언트(`src/generated/prisma`)를 Dockerfile이 명시적으로 복사한다 —
  standalone 출력은 이 셋을 자동으로 포함하지 않는다.
- 컨테이너 시작 시 `docker-entrypoint.sh`가 로컬에 이미 설치된 `prisma` CLI로
  `migrate deploy`를 실행(네트워크 다운로드 없음)하고, 실패하면 서버를 기동하지 않는다.
- **외부 인터넷에 노출하는 배포는 HTTPS가 필수**다. 세션 쿠키는 프로덕션 모드에서 `Secure`
  플래그가 켜지므로, 리버스 프록시(Caddy/nginx 등)로 TLS를 종단해야 로그인이 실제로
  동작한다. (문서 기준 예외: 최신 브라우저는 `http://localhost`를 신뢰 가능한 컨텍스트로
  취급해 평문 HTTP에서도 `Secure` 쿠키를 저장·전송한다고 알려져 있다 — 이 세션에서는
  `curl`로 프로덕션 모드 서버의 `Set-Cookie` 응답 헤더에 `Secure` 플래그가 실제로 찍히는
  것까지만 확인했고, 실제 브라우저에서 `http://localhost` 예외가 적용되는 것 자체는 확인하지
  못했다. 실제 배포 도메인에는 이 예외가 적용되지 않으므로 HTTPS는 그대로 필수다.)

## 백업 / 복구

운영 중인 SQLite 파일을 그냥 복사하지 않는다(WAL 모드에서 일관되지 않은 스냅샷이 될 수
있음). 다음 중 하나를 사용한다:

```bash
# (a) 컨테이너를 멈추고 파일 복사 — 가장 단순하고 확실함
docker compose stop app
cp <volume mount path>/prod.db backup-$(date +%F).db
docker compose start app

# (b) 온라인 상태에서 일관된 스냅샷 (컨테이너 내부에서)
docker compose exec app sqlite3 /data/prod.db "VACUUM INTO '/data/backup.db'"
```

복구는 컨테이너를 멈추고 백업 파일로 `/data/prod.db`를 교체한 뒤 재기동한다.

## PostgreSQL로 전환하고 싶다면

`DATABASE_URL`만 바꾼다고 되지 않는다. 실제로는 (1) `schema.prisma`의 provider와 드라이버
어댑터 교체, (2) Postgres 방언에 맞는 마이그레이션 재작성, (3) 기존 SQLite 데이터를
Postgres로 옮기는 별도 이전 작업이 필요하다. 모든 DB 접근이 `src/modules/*/service.ts`에
모여 있으므로, 전환 시 영향 범위는 그 파일들로 한정된다.

## 새 모듈 추가하기

`src/modules/registry.ts`에 항목을 추가하면 사이드바 메뉴와 홈 화면 위젯 노출까지는
자동으로 처리된다. 그 외 페이지, API 라우트, (필요하다면) Prisma 스키마와 마이그레이션은
새 모듈이 직접 갖춰야 한다 — 레지스트리가 공통 셸(레이아웃/사이드바) 코드를 건드리지 않고
모듈을 노출해줄 뿐, 모듈 자체를 만들어주지는 않는다.

## 테스트

```bash
npm run test:unit          # 순수 로직/검증 스키마 (DB·인증 불필요)
npm run build && npm run start:standalone   # 프로덕션 빌드로 서버 기동 (다른 터미널)
BASE_URL=http://localhost:3000 TEST_PASSWORD=<로그인 비밀번호> npm run test:integration
```

`test:integration`은 실행 중인 서버가 필요하다 — 인증 우회, CSRF Origin 검증, 입력 검증,
최신 기록 선택(삽입 순서 아님), 삭제 후 폴백 등을 실제 HTTP 요청으로 검증한다.

## 검증 상태

**핵심 구현 및 서버 테스트는 완료. 브라우저 UI·Docker·외부 HTTPS 검증은 남아 있다.**
확인 방법별로 구분한다(방법이 다르면 증명하는 범위도 다르다):

- **문서로 확인**(실행 재현은 아님): Docker Compose `.env`의 작은따옴표 규칙(공식 문서 인용),
  브라우저의 `http://localhost` Secure 쿠키 예외(일반적으로 알려진 동작, 실제 브라우저로
  재현하지는 못함).
- **HTTP/서버 레벨로 실행해 확인**: 유닛 테스트 23/23, 프로덕션 standalone 서버를 실제로
  띄워 `curl`/자동 통합 테스트 8/8로 로그인·CRUD·카드 상태 전이·CSRF·만료/변조 쿠키 거부·
  로그인 시도 제한·부팅 시 필수 환경변수 검증을 확인, `hash-password.mjs`를 실제 PTY로
  구동해 정상 입력·비밀번호 불일치·8자 미만 거부·Ctrl+C 취소·비TTY(파이프) 입력 시 즉시
  종료까지 확인, `@next/env`로 다시 읽은 해시가 `bcrypt.compare`로 원래 비밀번호와 일치하는
  것까지 확인.
- **실제 브라우저로 확인**: 하지 않음 — 이 세션에 브라우저 자동화 도구가 연결되어 있지 않다.
  로그인 폼 타이핑, 차트 렌더링, 사이드바 메뉴 이동/뒤로가기 시 홈 카드 갱신 등 눈으로
  보는 동작은 미검증.
- **Docker 빌드/배포**: 이 환경에 Docker 자체가 없어(`docker: command not found`) 이미지
  빌드, 컨테이너 기동, 볼륨 퍼시스턴스, 백업/복구, `docker compose`의 `.env` 인터폴레이션
  실제 동작은 전혀 실행해보지 못했다 — Docker가 설치된 환경(운영 서버 등)에서 최초 한 번
  반드시 직접 확인이 필요하다.

**테스트용 값 사용 금지**: 위 검증에 쓴 비밀번호(`test-password-123` 등)와 `.env`의
`SESSION_SECRET`은 이 세션이 로컬 검증 목적으로 생성한 것이다. 실제 배포 전 반드시
`node scripts/hash-password.mjs`로 본인 비밀번호를 재생성하고, `SESSION_SECRET`도 새로
생성해야 한다 — 테스트 값을 운영에 그대로 쓰지 않는다.
