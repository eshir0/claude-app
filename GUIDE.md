# 사용량 대시보드 — 사용 설명서

개인 서버에 직접 설치해서 쓰는 대시보드입니다. 지금은 두 가지를 보여줍니다.

1. **ChatGPT/Codex 사용량** — 5시간 한도·주간 한도가 얼마나 남았는지 실시간으로
2. **Proxmox 서버 상태** — 내 서버(호스트)와 그 안의 VM/컨테이너들이 잘 돌아가고 있는지

`README.md`가 개발자용(기술 검증 내역, 배포 세부사항)이라면, 이 문서는 **써보고 싶은 사람용**입니다.

> 📘 이 문서를 꾸며진 페이지로 보고 싶다면: **https://eshir0.github.io/claude-app/**

---

## 목차

- [화면 둘러보기](#화면-둘러보기)
- [처음 설치하기](#처음-설치하기)
- [환경변수 하나씩 설명](#환경변수-하나씩-설명)
- [ChatGPT/Codex 연결하기](#chatgptcodex-연결하기)
- [Proxmox 연결하기](#proxmox-연결하기)
- [온도 모니터링 설정하기 (선택)](#온도-모니터링-설정하기-선택)
- [알아두면 좋은 점](#알아두면-좋은-점)

---

## 화면 둘러보기

### 로그인 (`/login`)

비밀번호 하나로 로그인합니다. 계정이 여러 개일 필요가 없는, 나 혼자 쓰는 대시보드라서 그렇습니다.

### 홈 (`/`)

로그인하면 바로 보이는 화면. AI 사용량 카드와 서버 상태가 한눈에 요약되어 있고, 각 섹션 오른쪽 위의 새로고침 버튼(⟳)을 누르면 그 자리에서 즉시 최신 값을 가져옵니다.

### AI 사용량 (`/ai-usage`)

- **카드**: Codex 5시간 한도 / 주간 한도가 몇 % **남았는지**
- **그래프**: 시간에 따라 남은 비율이 어떻게 변했는지
- **기록 표**: 언제, 얼마나 남아 있었는지 전체 이력

값은 전부 자동으로 채워집니다 — 직접 타이핑해서 기록하는 기능은 없습니다(정확하지 않은 수기 입력보다, 실제로 연결해서 받아온 값만 신뢰하기로 했습니다).

### 자동 수집 연결 (`/ai-usage/connections`)

ChatGPT 계정을 연결하는 곳. 한 번 연결해두면 서버가 30분마다 알아서 최신 사용량을 가져옵니다.

### 서버 (`/server`)

- **호스트 카드**: CPU·메모리·루트 디스크 사용량, 가동 시간, (설정했다면) **CPU/내장 GPU/NVMe 온도**
- **데이터센터 스토리지**: VM/컨테이너 디스크가 실제로 저장되는 공간(`local-lvm` 등) — 호스트 자체 디스크와는 별개입니다
- **VM/컨테이너 목록**: 이름, 종류(QEMU/LXC), 실행 상태, CPU·메모리·**디스크**·**네트워크 속도(↓↑)**, 가동 시간

> **그래픽카드가 없는데 "내장 GPU 온도"가 나와요?** 오작동이 아닙니다 — "G"가 안 붙은 일반 데스크톱 Ryzen(7000 시리즈 이후)도 화면 출력·문제진단용으로 아주 작은 내장 그래픽(2 CU RDNA2)이 기본 탑재되어 있어서, 별도 그래픽카드 없이도 이 값이 잡힙니다.

디스크·저장공간 사용량은 **75% 넘으면 주황색, 90% 넘으면 빨간색**으로 표시됩니다. QEMU 가상머신은 하이퍼바이저가 가상디스크 안을 들여다볼 수 없어서 디스크 사용량이 0으로 나올 수 있는데, 고장이 아니라 원래 그렇습니다(LXC 컨테이너는 정상적으로 나옵니다).

---

## 처음 설치하기

### 필요한 것

- Node.js 24 이상
- 이 저장소를 실행할 서버(리눅스 권장) — 이 프로젝트 자체는 [`eshir0/claude-app`](https://github.com/eshir0/claude-app) 저장소에 있습니다

### 순서

1. **저장소 받고 설치**
   ```bash
   git clone https://github.com/eshir0/claude-app.git
   cd claude-app
   npm install
   ```

2. **환경변수 파일 만들기**
   ```bash
   cp .env.example .env
   ```
   그다음 아래 [환경변수 하나씩 설명](#환경변수-하나씩-설명)을 보면서 `.env`를 채웁니다.

3. **로그인 비밀번호 만들기**
   ```bash
   npm run hash-password
   ```
   화면에서 비밀번호를 직접 입력하면(입력값은 안 보임) bcrypt 해시가 출력됩니다. 이 값을 `.env`의 `AUTH_PASSWORD_HASH`에 붙여넣으세요.

   > ⚠️ **주의**: `.env` 파일은 `$` 기호를 특별하게 해석합니다. bcrypt 해시는 `$2b$12$...`처럼 `$`가 여러 번 들어가므로, 매 `$` 앞에 역슬래시를 붙여야 합니다: `\$2b\$12\$...`. `npm run hash-password`가 출력해주는 값은 이미 이렇게 이스케이프되어 있으니 그대로 복사하면 됩니다.

4. **데이터베이스 준비**
   ```bash
   npx prisma migrate dev
   ```

5. **실행**
   ```bash
   npm run dev        # 개발용, 코드 수정하면서 바로 확인
   # 또는
   npm run build && npm run start   # 실제로 계속 켜둘 때
   ```
   브라우저에서 `http://localhost:3000` (또는 `.env`의 `APP_ORIGIN`에 적은 주소)로 접속합니다.

---

## 환경변수 하나씩 설명

`.env` 파일에 들어가는 값들입니다. 전부 비밀 정보라 절대 깃허브에 올라가면 안 되고(`.gitignore`가 이미 막아줍니다), 남에게 보여주면 안 됩니다.

| 변수 | 뭐 하는 값인가요 | 예시 |
|---|---|---|
| `DATABASE_URL` | 데이터가 저장될 SQLite 파일 위치 | `file:./prisma/dev.db` |
| `AUTH_PASSWORD_HASH` | 로그인 비밀번호 (평문이 아니라 해시로) | `npm run hash-password` 결과 |
| `SESSION_SECRET` | 로그인 상태를 안전하게 유지하기 위한 임의의 값 | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` 로 생성 |
| `CREDENTIAL_ENCRYPTION_KEY` | ChatGPT 연결 정보를 암호화해서 저장할 때 쓰는 키 | 위와 같은 명령으로 생성(다른 값으로!) |
| `APP_ORIGIN` | 이 사이트에 실제로 접속하는 주소 | `http://localhost:3000` (여러 개면 쉼표로 구분) |
| `PROXMOX_URL` | Proxmox 웹 UI 주소 | `https://192.168.1.x:8006` |
| `PROXMOX_TOKEN_ID` | Proxmox API 토큰 이름 | `root@pam!dashboard` |
| `PROXMOX_TOKEN_SECRET` | Proxmox API 토큰 비밀값 | 토큰 만들 때 한 번만 보여줌 |
| `PROXMOX_SSL_FINGERPRINT` | Proxmox 서버가 진짜인지 확인하는 지문값 | 아래 [Proxmox 연결하기](#proxmox-연결하기) 참고 |
| `PROXMOX_SSH_HOST` | (선택) 온도 조회용 Proxmox 호스트의 **LAN IP** | `192.168.1.24` |
| `PROXMOX_SSH_KEY_PATH` | (선택) 온도 조회 전용 SSH 개인키 경로 | 아래 [온도 모니터링 설정하기](#온도-모니터링-설정하기-선택) 참고 |

`PROXMOX_*` 앞의 네 가지는 서버 모니터링 기능에 쓰입니다 — 안 채워도 앱은 정상 실행되고, "서버" 화면만 "연결 안 됨"으로 나옵니다. `PROXMOX_SSH_*` 두 가지는 그 위에 온도 표시를 더하는 선택 사항입니다.

---

## ChatGPT/Codex 연결하기

1. 로그인 후 `/ai-usage/connections`로 이동
2. **"연결하기"** 클릭
3. 화면에 링크와 코드(예: `ZNLX-BJ8PO`)가 뜹니다
4. **본인의 휴대폰이나 PC 브라우저**에서 그 링크를 열고, ChatGPT 계정으로 로그인한 뒤 코드를 입력
5. 화면이 자동으로 "연결됨"으로 바뀝니다

비밀번호나 쿠키를 직접 붙여넣지 않습니다 — OpenAI의 공식 로그인 방식(기기 코드 로그인)을 그대로 씁니다. 로그인은 항상 본인 브라우저에서 이뤄지고, 이 서버는 로그인 결과만 안전하게 저장합니다.

> **Claude(Anthropic)는 왜 지원 안 하나요?** Anthropic이 2026년 2월에 약관을 바꿔서, Claude Pro/Max 구독 로그인 정보를 서드파티 서비스(이 대시보드 같은)에서 쓰는 것을 공식적으로 금지했습니다. 그래서 이 기능은 만들지 않았습니다.

---

## Proxmox 연결하기

Proxmox 웹 UI에 로그인한 상태에서 진행합니다.

1. 왼쪽 트리에서 **Datacenter** 클릭
2. **Permissions → API Tokens** 클릭
3. 위쪽 **Add** 클릭
4. **User**는 기존 계정 그대로(`root@pam` 등), **Token ID**는 원하는 이름(예: `dashboard`), **Privilege Separation**은 체크 해제
5. **Add**를 누르면 뜨는 **Token ID**와 **Secret**을 복사 (Secret은 이 화면 닫으면 다시 못 봅니다)
6. 아래 명령으로 서버 지문값도 확인:
   ```bash
   curl -k https://<Proxmox 주소>:8006/api2/json/nodes
   ```
   결과에서 `ssl_fingerprint` 값을 복사

7. `.env`에 네 가지를 채우기:
   ```
   PROXMOX_URL=https://<Proxmox 주소>:8006
   PROXMOX_TOKEN_ID=<4번의 User>!<4번의 Token ID>
   PROXMOX_TOKEN_SECRET=<5번의 Secret>
   PROXMOX_SSL_FINGERPRINT=<6번의 ssl_fingerprint>
   ```

지문값을 등록해두는 이유는, 나중에 접속할 때마다 "지금 접속한 서버가 진짜 내 Proxmox가 맞는지"를 매번 확인하기 위해서입니다 — Proxmox 인증서가 공인 기관 서명이 아니라 자체 서명이라서, 이렇게 지문을 고정해두지 않으면 중간에서 누군가 가로채도 알아챌 방법이 없습니다.

---

## 온도 모니터링 설정하기 (선택)

Proxmox의 API 자체에는 온도 정보가 아예 없습니다. 그래서 이 기능은 API 토큰이 아니라 **SSH로 Proxmox 호스트에 직접 접속해서 `sensors` 명령을 읽어오는** 다른 방식을 씁니다. 설정 안 해도 나머지 기능은 전부 정상 작동하고, "서버" 화면에 온도 줄만 안 보입니다.

1. **전용 SSH 키 만들기** (이 앱을 실행하는 서버에서)
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/proxmox_dashboard_ed25519 -N ""
   cat ~/.ssh/proxmox_dashboard_ed25519.pub
   ```

2. **Proxmox 웹 UI → `Shell`에서 키 등록하기**
   왼쪽 트리에서 노드 클릭 → 오른쪽 위 `>_ Shell` 클릭. 아래 명령에서 `<공개키>` 자리에 1번에서 출력된 값을 통째로 넣고 실행:
   ```bash
   mkdir -p ~/.ssh && chmod 700 ~/.ssh
   echo 'command="sensors -j",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty <공개키>' >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```
   > `command="sensors -j"`가 핵심입니다 — 이 키로는 **`sensors -j` 명령 말고는 아무것도 실행할 수 없게** 강제로 제한합니다. 이 앱에 문제가 생기거나 키가 유출되어도 "온도 조회" 이상은 못 합니다.

3. **lm-sensors 설치 확인** (같은 Shell에서)
   ```bash
   which sensors || (apt update && apt install -y lm-sensors && yes | sensors-detect --auto)
   sensors -j
   ```
   결과로 JSON이 나오면 성공. 참고로 하드웨어에 따라 아무것도 안 잡히거나(`Sorry, no sensors were detected`), 팬 속도처럼 일부 값은 애초에 안 잡힐 수 있습니다 — 그런 값은 억지로 만들어내지 않고 그냥 표시하지 않습니다.

4. **`.env`에 채우기**
   ```
   PROXMOX_SSH_HOST=<Proxmox 호스트의 LAN IP, 예: 192.168.1.24>
   PROXMOX_SSH_KEY_PATH=/home/유저/.ssh/proxmox_dashboard_ed25519
   ```
   `PROXMOX_URL`(포트포워딩된 공인 주소)과 달리, 이건 **LAN 안에서 직접 접속하는 IP**를 씁니다 — Proxmox 웹 UI의 `Datacenter → <노드> → System → Network`에서 확인할 수 있습니다.

---

## 알아두면 좋은 점

- **HTTPS가 아직 없습니다.** 지금은 평문 HTTP입니다. 집 안(LAN)에서만 쓰면 크게 문제없지만, 공인 IP로 포트포워딩해서 인터넷에 열어두는 경우 로그인 비밀번호와 세션이 암호화 없이 오갑니다. 계속 공개로 열어두실 거면 도메인을 하나 마련해서 HTTPS(리버스 프록시 + Let's Encrypt)를 붙이는 걸 권장합니다.
- **재부팅하면 자동으로 다시 켜지지 않습니다.** 지금은 사람이 직접 실행해야 합니다. 계속 켜두고 쓰실 거면 systemd 서비스 등록을 추천합니다.
- **AI 사용량 기록은 이력이 DB에 쌓이지만, 서버(Proxmox) 상태는 실시간 값만 보여주고 따로 저장하지 않습니다.** Proxmox 자체가 이미 자기 이력을 갖고 있어서입니다.
