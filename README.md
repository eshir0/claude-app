# 사용량 대시보드

> 📘 사용법·설치 방법을 쉽게 정리한 안내서: **https://eshir0.github.io/claude-app/** (또는 `GUIDE.md`) — 이 문서는 개발자용(기술 검증 내역, 배포 세부사항)이다.

개인 서버에 배포하는 자체 호스팅 대시보드. 모듈형 베이스 위에 두 가지를 실시간으로 보여준다.

## 기능

| 모듈 | 보여주는 것 | 데이터를 가져오는 방식 |
|---|---|---|
| **AI 사용량**<br>`/ai-usage` | ChatGPT Codex 5시간·주간 한도 남은 비율, 리셋 시각(카운트다운 포함), 이력 그래프 | Codex CLI의 공식 기기 코드(device‑code) OAuth 로그인 → `chatgpt.com/backend-api/wham/usage`. 서버가 **30분마다 자동 수집**, 홈 화면 새로고침 버튼으로 즉시 수집도 가능. 수동 입력 기능은 없음 |
| **서버**<br>`/server` | Proxmox 호스트 CPU·메모리·디스크·온도, 데이터센터 스토리지 풀, VM·LXC별 CPU·메모리·디스크·네트워크 속도 | Proxmox API 토큰(TLS 인증서 지문 고정) + 온도는 SSH로 `lm-sensors` 조회(선택 기능, 별도 설정 필요) |
| **로또 번호 생성**<br>`/lotto` | 실제 역대 당첨 번호(1회~) 통계 기반 12가지 규칙으로 검증한 조합 5세트 + "오늘의 랜덤 조합" 1개 | `superkts.com` 당첨 번호 목록 페이지를 스크레이핑. 서버가 **6시간마다 새 회차 여부를 확인**, 매주 추첨 다음 회차가 새로 나오면 그 회차 기준으로 조합을 한 번만 새로 생성(같은 회차는 재생성하지 않음). 홈 화면 새로고침 버튼은 이미 계산된 상태를 다시 읽어올 뿐, 그 자리에서 새로 생성하지 않음 |

- 값을 직접 타이핑해 기록하는 기능은 없다 — 정확성이 보장되지 않는 수기 입력 대신, 실제로 수집한 값만 신뢰하기로 했다.
- **Claude Pro는 추적하지 않는다.** Anthropic이 2026-02 Consumer Terms of Service 개정으로 Free/Pro/Max 구독 OAuth 토큰(또는 세션 쿠키)을 Claude Code/claude.ai가 아닌 제3의 도구에서 쓰는 것을 명시적으로 금지했다 — 세션 쿠키 방식이 Cloudflare 봇 탐지에 막혀 기술적으로도 불가능했던 것과는 별개의, 정책상의 이유다.

## 화면

| 경로 | 내용 |
|---|---|
| `/login` | 비밀번호 로그인(단일 사용자 앱) |
| `/` | 홈 — 세 모듈 카드 요약, 섹션별 새로고침 (로또 섹션은 맨 아래) |
| `/ai-usage` | 카드 + 이력 그래프 + 전체 기록 표 |
| `/ai-usage/connections` | ChatGPT 계정 연결(기기 코드 로그인) |
| `/server` | Proxmox 호스트·스토리지·VM/LXC 상세 |
| `/lotto` | 로또 조합 5세트 상세(번호별 빈출/중간/저빈도 구분, 홀짝·고저·합계, 주목할 부분조합) |

## 기술 스택

| 레이어 | 선택 |
|---|---|
| 프레임워크 | Next.js 16.3 (App Router, `middleware.ts`가 아닌 `proxy.ts`) |
| 언어 / UI | TypeScript, React 19, Tailwind CSS v4 |
| DB | Prisma 7.10 + SQLite (`better-sqlite3` 드라이버 어댑터) |
| 인증 | iron-session 기반 커스텀 세션(NextAuth 미사용) |
| 런타임 | Node.js 24 |
| 배포 | systemd 사용자 서비스(현재 운영 중, 검증됨) 또는 Docker(작성은 되어 있으나 이 개발 환경엔 Docker 자체가 없어 미검증) |

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

| 실행 방식 | `$` 처리 | 형식 |
|---|---|---|
| `npm run dev` / `npm run start:standalone` (Next.js `@next/env`) | `$VARIABLE`를 다른 변수 참조로 자동 치환 — 이스케이프 안 하면 `$2b`, `$12`가 존재하지 않는 변수로 취급되어 값이 통째로 빈 문자열이 됨(앱은 이 경우 부팅을 거부한다) | `AUTH_PASSWORD_HASH=\$2b\$12\$나머지...` (모든 `$` 앞에 `\`) |
| `docker compose` (compose의 `${VAR}` 인터폴레이션, 공식 문서 기준) | 값이 **작은따옴표**로 감싸져 있으면 이스케이프 없이 그대로 사용 — 백슬래시를 쓰면 안 됨(백슬래시 자체가 값에 포함됨) | `AUTH_PASSWORD_HASH='$2b$12$나머지...'` |

`npm run hash-password`(대화형)를 실행하면 두 형식을 모두 라벨을 붙여 출력해준다 — 실행
방식에 맞는 줄을 그대로 복사해서 쓰면 된다. **이 둘을 같은 `.env` 파일에 함께 써야 하는
경우는 없어야 한다** — `docker compose`는 기본적으로 `docker-compose.yml`과 같은 위치의
`.env`를 자동으로 읽으므로, 로컬 개발용 `.env`(Next.js 이스케이프 형식)를 그대로 Docker
배포에도 재사용하면 형식이 맞지 않아 깨진다. 배포용 `.env`는 로컬 개발용과 분리해서
관리한다(예: 별도 디렉터리, 또는 배포 서버 전용 `.env`).

Next.js 쪽 형식은 이 세션에서 직접 실행해 확인했다 — 생성된 해시를 위 형식으로 `.env`에
써서 `@next/env`로 다시 읽은 뒤 원래 비밀번호로 `bcrypt.compare`가 성공하는 것까지 검증함.
Docker Compose 쪽 작은따옴표 규칙은 [공식 문서](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)에
근거했지만, 이 환경에 Docker가 없어 `docker compose` 자체로 실행 재현은 하지 못했다 —
미검증으로 남겨둔다(아래 "검증 상태" 참고).

## 환경변수

`.env.example`에 전체 목록과 예시가 있다. 핵심만 정리하면:

| 변수 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite 파일 경로 |
| `AUTH_PASSWORD_HASH` | ✅ | 로그인 비밀번호의 bcrypt 해시 (`$` 이스케이프 위 표 참고) |
| `SESSION_SECRET` | ✅ | 세션 서명용 임의값(32바이트 이상) |
| `APP_ORIGIN` | ✅ | 접속 주소(CSRF Origin 검증용) — 쉼표로 여러 개 지정 가능 |
| `CREDENTIAL_ENCRYPTION_KEY` | ✅ | ChatGPT 연결 정보 암호화 키 |
| `PROXMOX_URL` / `PROXMOX_TOKEN_ID` / `PROXMOX_TOKEN_SECRET` / `PROXMOX_SSL_FINGERPRINT` | 선택 | Proxmox 서버 모니터링. 넷 다 없으면 "서버" 화면이 "연결 안 됨"으로만 나오고 나머지는 정상 동작 |
| `PROXMOX_SSH_HOST` / `PROXMOX_SSH_KEY_PATH` | 선택 | 온도 모니터링(위 넷과 별개, SSH+lm-sensors 방식) |
| `CODEX_CLI_PATH` | 선택 | `codex` 바이너리 경로 — 기본값(`node_modules/.bin/codex`)이 대부분의 경우 맞음 |
| `FORCE_INSECURE_COOKIES` | 선택, 위험 | LAN IP 등 `localhost`가 아닌 주소로 평문 HTTP 테스트할 때만(아래 참고) |

하나라도 필수 항목이 없거나 형식이 잘못되면 서버가 요청을 받기 전에 스스로 종료한다
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

1. 이 앱의 포트를 인터넷에 직접 노출하지 않는다 — 신뢰하는 리버스 프록시만 이 앱에
   닿을 수 있어야 한다.
2. 리버스 프록시(Caddy/nginx 등)가 클라이언트가 보낸 전달 헤더를 무시하고, 실제 접속 주소로
   덮어써서 전달하도록 설정한다 (예: nginx `proxy_set_header X-Forwarded-For $remote_addr;`).
3. 그 구성에서만 `.env`에 `TRUSTED_PROXY=true`와 `CLIENT_IP_HEADER=X-Forwarded-For`를 설정한다.

이 두 값을 설정하지 않으면(기본값), 신뢰할 수 없는 헤더로 제한을 우회하는 대신 **서버
전체(IP 무관) 로그인 제한**으로 대체 동작한다 — 개인용 단일 사용자 앱에 맞는 거친 대안이다.
두 경우 모두 인메모리 상태라 앱 재시작 시 초기화된다(단일 인스턴스 전제, 한계로 인정).

## 알려진 한계 (의도적 설계 선택)

| 한계 | 이유 / 대응 |
|---|---|
| 세션이 상태 비저장(stateless)이다 | 로그아웃은 브라우저에 쿠키 삭제를 지시할 뿐 서버 측 폐기 목록이 없다 — 탈취된 세션 토큰은 로그아웃 전이면 자연 만료(12시간)까지 재생 가능. 개인 단일 사용자 앱 위협 모델에서 감수 가능하다고 판단 |
| 로그인 시도 제한이 단일 인스턴스·인메모리다 | 재시작하면 초기화된다 |
| SQLite는 단일 서버·단일 인스턴스 운영을 전제한다 | SQLite 자체는 여러 프로세스 접근과 동시 쓰기 직렬화를 지원하지만(공식 FAQ), 네트워크 파일시스템에서는 잠금이 보장되지 않고, 애초에 수평 확장이 필요 없는 개인용 앱이라 단일 인스턴스로 설계 |
| HTTPS가 기본 제공되지 않는다 | Let's Encrypt는 IP 주소에 인증서를 발급하지 않는다 — 도메인(또는 무료 DDNS 호스트네임)을 마련하고 리버스 프록시를 앞단에 두는 건 배포자 몫 |
| Proxmox 서버 이력은 저장하지 않는다 | 실시간 스냅샷만 보여준다 — Proxmox 자체가 이미 RRD 이력을 갖고 있어서, 중복 저장하지 않기로 함 |

## 배포

### systemd (실제 운영 중인 방식, 검증됨)

```bash
npm run build
mkdir -p ~/.config/systemd/user
cp deploy/claude-app.service.example ~/.config/systemd/user/claude-app.service
# 파일 안의 /home/YOUR_USER/claude-app 경로를 실제 설치 경로로 수정
systemctl --user daemon-reload
systemctl --user enable --now claude-app.service
sudo loginctl enable-linger $USER   # 재부팅 시(로그인 없이도) 자동 시작
```

root 권한 없이(linger 활성화 한 번만 예외) 등록 가능하다. 코드를 바꾼 뒤에는
`npm run build && systemctl --user restart claude-app.service`로 재배포한다 — 정적 자산
동기화(`scripts/sync-standalone-assets.sh`)는 서비스 시작 시 자동 실행된다. 실제로 강제
종료(`kill -9`) 후 5초 내 자동 재시작되는 것까지 확인했다. 자세한 단계는 GUIDE.md의
"systemd로 자동 실행 설정하기" 참고.

### Docker (작성됨, 이 개발 환경에서 미검증)

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
- **외부 인터넷에 노출하는 배포는 HTTPS가 필수**다(어느 배포 방식이든 동일) — 세션 쿠키는
  프로덕션 모드에서 `Secure` 플래그가 켜지므로, 리버스 프록시(Caddy/nginx 등)로 TLS를
  종단해야 로그인이 실제로 동작한다.

## 백업 / 복구

운영 중인 SQLite 파일을 그냥 복사하지 않는다(WAL 모드에서 일관되지 않은 스냅샷이 될 수
있음). 다음 중 하나를 사용한다:

```bash
# (a) 프로세스를 멈추고 파일 복사 — 가장 단순하고 확실함
systemctl --user stop claude-app.service   # 또는 docker compose stop app
cp prisma/dev.db backup-$(date +%F).db
systemctl --user start claude-app.service

# (b) 온라인 상태에서 일관된 스냅샷
sqlite3 prisma/dev.db "VACUUM INTO 'backup.db'"
```

## PostgreSQL로 전환하고 싶다면

`DATABASE_URL`만 바꾼다고 되지 않는다. 실제로는 (1) `schema.prisma`의 provider와 드라이버
어댑터 교체, (2) Postgres 방언에 맞는 마이그레이션 재작성, (3) 기존 SQLite 데이터를
Postgres로 옮기는 별도 이전 작업이 필요하다. 모든 DB 접근이 `src/modules/*/service.ts`에
모여 있으므로, 전환 시 영향 범위는 그 파일들로 한정된다.

## 새 모듈 추가하기

`src/modules/registry.ts`에 항목을 추가하면 사이드바 메뉴와 홈 화면 위젯 노출까지는
자동으로 처리된다(배열 순서 = 홈 화면 섹션 순서). 그 외 페이지, API 라우트, (필요하다면)
Prisma 스키마와 마이그레이션은 새 모듈이 직접 갖춰야 한다 — 레지스트리가 공통 셸(레이아웃/
사이드바) 코드를 건드리지 않고 모듈을 노출해줄 뿐, 모듈 자체를 만들어주지는 않는다.
`proxmox`, `lotto` 두 모듈 모두 이 패턴이 반복 적용됨을 확인해준 사례다.

## 테스트

```bash
npm run test:unit          # 순수 로직/검증 스키마 — DB·인증·네트워크 불필요, 94개
npm run build && npm run start:standalone   # 프로덕션 빌드로 서버 기동 (다른 터미널)
BASE_URL=http://localhost:3000 TEST_PASSWORD=<로그인 비밀번호> npm run test:integration
```

`test:integration`은 실행 중인 서버 + `DATABASE_URL`(서버와 동일한 값)이 필요하다 — 인증
우회, CSRF Origin 검증, 입력 검증, 최신 기록 선택(삽입 순서 아님), 삭제 후 폴백 등을 실제
HTTP 요청으로 검증한다(테스트 데이터는 공개 create 엔드포인트가 없어 Prisma로 직접 시딩).

## 검증 상태

확인 방법별로 구분한다(방법이 다르면 증명하는 범위도 다르다):

- **실제 운영 환경에서 라이브로 확인**: systemd 서비스 기동·요청 처리·강제종료 후 5초 내
  자동 재시작, Proxmox API 토큰 인증 + TLS 인증서 지문 고정(정상/위조 지문 양쪽 모두 별도
  프로세스에서 재검증), SSH 기반 `lm-sensors` 온도 조회, Codex 기기 코드 로그인 전 과정
  (본인 계정으로 실제 로그인 완료 → `wham/usage` 실제 응답 확보 → 지표 매핑 → 홈 카드 반영).
- **HTTP/서버 레벨로 실행해 확인**: 유닛 테스트 94/94, 프로덕션 standalone 서버를 실제로
  띄워 통합 테스트로 로그인·CRUD·카드 상태 전이·CSRF·만료/변조 쿠키 거부·로그인 시도 제한·
  부팅 시 필수 환경변수 검증을 확인.
- **로또 모듈 실측 검증**: 격리된 DB 사본 + 별도 포트로 개발 서버를 띄워, 백그라운드
  스케줄러가 `superkts.com`에서 실제 1회~1240회 전체(약 124페이지)를 스크레이핑해 저장하고
  1240회 기준 조합 5세트를 생성하는 전체 파이프라인을 종단 간(end-to-end) 확인했다. 이어서
  서버를 재기동해 두 번째 틱을 재현했고, 이미 저장된 회차·이미 생성된 조합 세트를 다시
  만들지 않는(고유 제약 기반 멱등성) 것도 확인했다.
- **문서로만 확인**(실행 재현은 아님): Docker Compose `.env`의 작은따옴표 규칙(공식 문서
  인용), 브라우저의 `http://localhost` Secure 쿠키 예외(일반적으로 알려진 동작).
- **실제 브라우저로 확인**: 하지 않음 — 이 개발 환경에 브라우저 자동화 도구가 연결되어
  있지 않다. 로그인 폼 타이핑, 반응형 레이아웃(사이드바 열고 닫기 등), 차트 렌더링처럼
  눈으로 보는 동작은 사용자가 직접 확인해야 한다.
- **Docker 빌드/배포**: 이 개발 환경에 Docker 자체가 없어(`docker: command not found`)
  이미지 빌드, 컨테이너 기동, 볼륨 퍼시스턴스, `docker compose`의 `.env` 인터폴레이션 실제
  동작은 전혀 실행해보지 못했다 — 이 방식을 쓴다면 최초 한 번 반드시 직접 확인이 필요하다.

**테스트용 값 사용 금지**: 개발 중 검증에 쓴 비밀번호나 `SESSION_SECRET` 등은 로컬 검증
목적으로 생성한 것이다. 실제 배포 전 반드시 `node scripts/hash-password.mjs`로 본인
비밀번호를 재생성하고, `SESSION_SECRET`·`CREDENTIAL_ENCRYPTION_KEY`도 새로 생성해야 한다.
