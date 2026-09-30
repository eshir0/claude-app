# 🛰 접속 기록 설계

> 자체 호스팅 서버 여러 대로 들어온 **실제 접속 IP**를 이 대시보드 한 곳에 모으는 방법과, 그 과정에서 지키는 신뢰 경계를 정리한 문서입니다.
> 요약은 [README](../README.md#-접속-기록)에 있습니다.

## 📑 목차

1. [대시보드에서 보이는 것](#-대시보드에서-보이는-것)
2. [수집 방식 한눈에 보기](#-수집-방식-한눈에-보기)
3. [서비스 하나를 추가하는 패턴](#-서비스-하나를-추가하는-패턴)
4. [구조](#구조)
5. [claude-app 자신에 설치](#claude-app-자신에-설치)
6. [다른 서버에 설치](#다른-서버에-설치)
7. [중간에 NAT/VPN 게이트웨이가 하나 더 있는 경우](#중간에-natvpn-게이트웨이가-하나-더-있는-경우예-wireguard)
8. [신뢰 경계 (반드시 읽을 것)](#신뢰-경계-반드시-읽을-것)
9. [위치 표시와 GeoIP 프라이버시](#위치국가도시-표시와-geoip-프라이버시-트레이드오프)
10. [보존 기간](#보존-기간)

---

## 👀 대시보드에서 보이는 것

| 기능 | 동작 |
|---|---|
| 고유 IP 요약 | IP · 위치(도시, 국가) · 접속한 서버 목록 · 횟수 · 최초/최근 접속. 행을 누르면 개별 요청(시각·서버·메서드·경로·User-Agent) |
| 위험 IP 표시 | `.env`, `.git/config`, `wp-login.php`, `phpmyadmin`, 경로 탈출(`../`) 같은 **스캐너·공격 경로**를 한 번이라도 요청한 IP를 빨간색으로 표시 (`src/modules/access-log/suspicious-path.ts`). 목록 기반 추정이며 IDS/WAF가 아님 |
| 홈 위젯 필터 | 홈에는 **100회 이상** 접속한 IP만. 전체는 `/access-log` |
| IP 삭제 | 행 오른쪽 휴지통 → 그 IP의 접속 기록과 위치 캐시 삭제 |
| 1만 회 초기화 | 한 IP의 기록이 10,000건을 넘으면 그 IP의 기록을 비움 (10분 주기 정리 작업) |
| 보존 | 90일 지난 기록은 자동 삭제 |
| 넓은 표 | 표를 마우스로 꾹 눌러 좌우로 끌어 이동 |

## 🔎 수집 방식 한눈에 보기

| 도구 | 쓰는 곳 | 실제 IP를 어떻게 얻나 | 기록되는 것 |
|---|---|---|---|
| `scripts/ip-log-agent.mjs` | **HTTP** 서비스 앞 | 소켓 주소, 또는 신뢰하는 앞단(`AGENT_TRUSTED_UPSTREAM_IPS`)이 넘긴 `X-Forwarded-For` 첫 값 | 메서드 · 경로(쿼리 제외) · User-Agent |
| `scripts/tcp-log-relay.mjs` | **TCP/TLS** 서비스 앞 (Proxmox 웹, 마인크래프트 등 헤더를 못 쓰는 것) | 소켓 주소, 또는 신뢰하는 앞단 중계가 붙인 PROXY protocol v1 헤더 | 연결 1건 (경로는 `/`) |

두 스크립트 모두 의존성 없는 파일 하나이고, **보고 모드**(ingest URL+키 설정)와 **순수 중계 모드**(둘 다 비움) 중 하나로 동작합니다.

## 🧩 서비스 하나를 추가하는 패턴

외부 → 공인 IP를 가진 서버 → WireGuard → 게이트웨이 → 실제 서비스처럼 홉이 여러 개일 때, 각 홉에 같은 스크립트를 하나씩 둡니다. 예시 (HTTP 서비스 `stock`):

| 홉 | 유닛 | 역할 | 핵심 설정 |
|---|---|---|---|
| 공인 서버 (NPM 뒤) | `home-agent-stock` | 순수 중계 | `PUBLIC_PORT=8080` → `APP_HOST=<WG 상대 주소>:8080`, `TRUSTED_UPSTREAM_IPS=<NPM 컨테이너 IP>` |
| WG 게이트웨이 | `access-agent-stock` | 순수 중계 | `PUBLIC_PORT=8080` → `APP_HOST=<claude-app LAN IP>:8081`, `TRUSTED_UPSTREAM_IPS=<공인 서버의 WG IP>` |
| claude-app | `stock-access-agent` | **보고** (source `stock`) | `PUBLIC_PORT=8081` → 실제 서비스 `IP:8080`, `TRUSTED_UPSTREAM_IPS=<게이트웨이 LAN IP>`, 키는 0600 `EnvironmentFile` |

- 보고하는 홉을 claude-app에 두면 **ingest 키가 이 서버 밖으로 나가지 않습니다.** 다른 홉에는 비밀값이 없습니다.
- 앞단 iptables DNAT가 같은 포트를 잡고 있으면 패킷이 중계 프로세스를 거치지 않으므로, 그 DNAT는 반드시 지웁니다.
- 주기적으로 자동 호출되는 API(예: 2초마다 `/api/state`)는 `AGENT_SKIP_PATH_PREFIXES`에 넣어 기록에서 뺍니다(기본값도 함께 적어야 유지됨).
- 중계 agent는 upstream으로 보내는 `Host` 헤더를 목적지 주소로 바꿉니다. 서비스가 Host를 검사하면 그 주소를 허용 목록에 추가합니다.
- `iptables -t nat -A POSTROUTING -j MASQUERADE`처럼 **조건 없는 MASQUERADE**가 앞단에 있으면 Docker 컨테이너(NPM)로 들어가는 연결의 출발지까지 바뀌어 실제 IP가 사라집니다. 필요한 트래픽에만 좁게 거세요.

---


이 앱을 포함해 자신이 운영하는 여러 자체 호스팅 서버에 **어떤 IP가, 언제, 어느 서버로**
접속했는지 한 대시보드에서 보기 위한 기능. 각 서버가 스스로 자기 접속을 캡처해서 이
대시보드로 "보고"하는 방식이다 — 이 서버가 다른 Proxmox 게스트로 향하는 트래픽을 직접
가로챌 방법은 없다(같은 브리지의 게스트 하나일 뿐이라 다른 게스트로 가는 트래픽이 이
컨테이너를 거치지 않는다).

## 구조

```
다른 서버(예: pihole)                    이 대시보드(claude-app)
┌─────────────────────┐                  0.0.0.0:3000
│ ip-log-agent.mjs      │──POST(LAN)────▶ ┌───────────────────────────┐
│ (그 서버 자신의 :port) │                 │ ip-log-agent.mjs (public)  │
└─────────────────────┘                  │  → 127.0.0.1:3001 로 전달   │
                                          │  /api/access-log/ingest    │
claude-app 자신도 동일 agent를            │  자체 경로는 절대 로그 안 함│
0.0.0.0:3000 앞단에 두고,                 └──────────┬────────────────┘
127.0.0.1:3001(Next)로 전달                          ▼
                                          Next(127.0.0.1:3001) →
                                          /api/access-log/ingest → Prisma
```

`scripts/ip-log-agent.mjs`는 의존성 없는 순수 Node 스크립트 하나다. 실제 요청을
그대로 프록시하면서, 동시에 진짜 접속 IP(클라이언트가 보낸 `X-Forwarded-For`는 무조건
버리고 소켓 주소로 덮어씀)를 이 대시보드의 ingest API로 비동기 보고한다 — 보고가
실패해도 프록시된 응답에는 전혀 영향을 주지 않는다. `/api/access-log/ingest` 자기 자신에
대한 요청은 (다른 서버의 보고가 이 앱의 public agent를 거쳐갈 때도) 절대 접속 기록으로
남기지 않는다 — 안 그러면 보고 자체가 또 하나의 가짜 접속 기록을 만들게 된다.

## claude-app 자신에 설치

```
cp deploy/claude-app-access-agent.service.example ~/.config/systemd/user/claude-app-access-agent.service
# claude-app.service도 PORT=3001/HOSTNAME=127.0.0.1로 바뀐 버전으로 교체
systemctl --user daemon-reload
systemctl --user enable --now claude-app-access-agent.service
systemctl --user restart claude-app.service
```

## 다른 서버에 설치

`scripts/ip-log-agent.mjs` 파일 하나만 복사하면 된다(이 저장소의 나머지 코드나
`node_modules`가 전혀 필요 없음). `AGENT_APP_HOST`/`AGENT_APP_PORT`는 그 서버 자신의
실제 서비스를 가리키고, `AGENT_INGEST_URL`은 **claude-app의 LAN IP**, public agent
포트(3000) 기준으로 설정한다 — `127.0.0.1`은 claude-app 자기 자신에서만 의미가 있다:

```
AGENT_INGEST_URL=http://<claude-app의 LAN IP>:3000/api/access-log/ingest
```

`AGENT_SOURCE_NAME`은 claude-app의 `.env`에 있는 `ACCESS_LOG_INGEST_KEYS`에 새 항목을
추가하고, 그 값을 그 서버의 `AGENT_INGEST_KEY`로 넣는다 — 서버마다 별도 credential이라
한 서버의 키가 유출돼도 다른 서버(또는 claude-app 자신) 행세를 할 수 없다.

## 중간에 NAT/VPN 게이트웨이가 하나 더 있는 경우(예: WireGuard)

외부 → 공인 IP를 가진 홈 서버 → WireGuard 터널 → (자기 자신도 서버인) 게이트웨이 →
claude-app 처럼, claude-app 앞에 순수 L3 NAT 홉이 하나 더 있는 구성이면 얘기가 다르다.
그 홉이 **DNAT만** 한다면(목적지만 바꿈, 출발지는 그대로) 진짜 클라이언트 IP가 그대로
살아서 도착하지만, 그 홉이 (흔히 응답 패킷이 다시 터널로 돌아오게 하려고) **자기 자신으로
SNAT까지** 한다면 진짜 IP는 claude-app에 닿기도 전에 사라진다 — 이건 claude-app 쪽에서
헤더를 아무리 잘 처리해도 복구할 수 없다. 그 홉의 raw 소켓 단계에서만 아직 진짜 IP가 남아있기
때문이다.

해결책은 그 게이트웨이에도 `ip-log-agent.mjs`를 그대로 하나 더 두는 것이다 — 단,
`AGENT_INGEST_URL`/`AGENT_INGEST_KEY`를 아예 설정하지 않으면 **순수 릴레이 모드**로 동작해서
(자기 접속을 보고하지 않고 프록시+실제 IP 전달만 함), 그 게이트웨이 자신을 access-log의
별도 source로 남기고 싶지 않다면 그대로 두면 된다. 그 게이트웨이가 원래 하던 순수 iptables/
nftables DNAT를 **로컬 프로세스로 리다이렉트**하도록 바꾸고(그래야 패킷이 커널 NAT 규칙을
거쳐 바로 다음 홉으로 가버리지 않고 이 프로세스가 실제로 받는다), 그 프로세스가 자신이 본
진짜 소켓 주소로 `X-Forwarded-For`를 설정해서 claude-app으로 넘긴다.

그다음 claude-app 쪽 에이전트에 `AGENT_TRUSTED_UPSTREAM_IPS`로 그 게이트웨이의 (LAN 쪽)
IP를 정확히 등록해야, claude-app의 에이전트가 "이 특정 peer에서 온 요청은 그쪽이 이미 검증한
`X-Forwarded-For`를 신뢰"하도록 전환된다 — 등록 안 된 다른 모든 peer는 여전히 지금처럼
소켓 주소로 무조건 덮어쓴다(스푸핑 방지). 신뢰는 헤더가 아니라 **접속이 실제로 그 IP에서
왔다는 사실 자체**에 근거한다(nginx의 `set_real_ip_from`과 같은 모델) — LAN 안에서 그 IP를
사칭하려면 그 정확한 호스트를 직접 장악해야 한다.

예(iptables, 게이트웨이가 기존에 `--dport 3000`을 claude-app으로 DNAT하던 경우):

```bash
# 1) 기존 DNAT 규칙(포트 3000을 claude-app으로 직접 보내던 것)을 제거
#    — 정확한 규칙은 환경마다 다르므로 iptables -t nat -L -n --line-numbers 으로 확인 후 삭제

# 2) 같은 포트에서 이 에이전트를 직접 실행 — 이제 커널 NAT가 아니라 이 프로세스가 직접 받음
AGENT_SOURCE_NAME=wg-gateway \
AGENT_PUBLIC_PORT=3000 \
AGENT_APP_HOST=192.168.1.179 \
AGENT_APP_PORT=3000 \
node ip-log-agent.mjs
```

claude-app 쪽(`claude-app-access-agent.service`)에는:

```
Environment=AGENT_TRUSTED_UPSTREAM_IPS=<게이트웨이의 LAN IP>
```

를 추가한다.

## 신뢰 경계 (반드시 읽을 것)

- 프록시된 실제 트래픽과 ingest 보고(그 안의 credential 포함) 모두 **평문 HTTP**로
  오간다. 신뢰하는 사설 홈랩/Proxmox LAN 안에서만 이 상태로 두는 것을 전제로 한
  설계다.
- **신뢰할 수 없는 네트워크나 인터넷에는 이 구조를 그대로 노출하지 말 것** — 그런
  환경에서는 ingest 경로 앞에 HTTPS 리버스 프록시나 암호화된 VPN/터널이 반드시
  있어야 한다. `AGENT_INGEST_KEY`를 평문 HTTP로 인터넷을 거쳐 보내지 않는다.
- 쿼리 문자열은 절대 저장하지 않는다(토큰/API 키 등 유출 방지) — 하지만 경로(pathname)
  자체는 그대로 저장된다. `/reset/<token>` 처럼 경로에 민감한 값을 넣는 앱을 이 구조
  뒤에 둔다면 그 경로를 `AGENT_SKIP_PATH_PREFIXES`에 추가해서 기록에서 제외해야 한다.

## 위치(국가/도시) 표시와 GeoIP 프라이버시 트레이드오프

`ACCESS_LOG_GEO_ENABLED`(기본 켜짐)가 켜져 있으면, 처음 보는 IP에 한해
[ipwho.is](https://ipwho.is)(무료, API 키 불필요, **HTTPS**, 1,000회/일, 벌크 조회
없음)로 국가/도시를 조회해 캐싱한다. `ip-api.com`도 검토했으나 무료 티어가 벌크 조회를
지원하는 대신 **HTTPS를 지원하지 않아** IP를 평문으로 제3자에게 보내야 했다 — 이 프로젝트의
조회는 애초에 요청 경로가 아니라 백그라운드에서 신규/오래된 IP에 한해서만 일어나므로,
처리량보다 전송 암호화를 우선했다. "IP를 제3자에게 보낸다"와 "그걸 평문으로 보낸다"는
서로 다른 트레이드오프이며, 이 앱은 후자를 피하는 쪽을 택했다. `ACCESS_LOG_GEO_ENABLED=false`로
설정하면 위치 조회 자체를 완전히 끌 수 있다(IP만 기록).

사설 대역(RFC1918, loopback 등)이나 IANA가 아직 글로벌 유니캐스트로 할당하지 않은 IPv6
주소는 애초에 외부로 조회하지 않는다. 해석에 실패한 요청(429 등)은 재시도하고, 실패의
원인이 "이 IP 하나의 문제"인지 "provider 전체 quota 문제"인지 구분해서 후자는 일정 시간
전체 조회를 멈춘다.

## 보존 기간

접속 기록은 **90일** 보관 후 자동 삭제된다. 더 이상 남아있는 접속 기록이 없는 IP의 위치
캐시도 함께 정리되어(다시 나타나면 재조회), 오래된 IP가 영구히 GeoIP 조회 quota를
소모하지 않는다.
