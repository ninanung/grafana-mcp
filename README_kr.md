# grafana-mcp

[![npm version](https://img.shields.io/npm/v/@seungje.jun/grafana-mcp.svg)](https://www.npmjs.com/package/@seungje.jun/grafana-mcp)
[![license](https://img.shields.io/npm/l/@seungje.jun/grafana-mcp.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@seungje.jun/grafana-mcp.svg)](https://nodejs.org)

Grafana API 중 **자연어 기반 로그 조회**에 집중한 부분을 MCP(Model Context Protocol) 서버로 노출합니다. 목표는 "api 서비스의 최근 30분 에러 로그 보여줘" 같은 자연어를 그대로 받아 LogQL·라벨·datasource uid를 직접 다루지 않고도 실제 로그 라인을 돌려주는 것입니다.

로그 데이터소스 목록, Loki 라벨, 그리고 "서비스명 → (데이터소스, 라벨)" 매핑을 디스크에 캐싱하여 반복 호출 시 라벨 스캔을 생략합니다.

[English README](./README.md)

## 설치 및 설정

### 1. Grafana 인스턴스 등록

`~/.grafana-mcp/instances.json`에 Grafana URL + 인증 정보 쌍을 원하는 이름으로 등록합니다. 처음에는 1개만 있어도 됩니다.

```json
{
  "default": "dev",
  "instances": [
    { "name": "dev", "url": "https://grafana-dev.example.com", "service_account_token": "glsa_xxx" },
    { "name": "prod", "url": "https://grafana.example.com", "service_account_token": "glsa_xxx" }
  ]
}
```

```bash
chmod 600 ~/.grafana-mcp/instances.json
```

모든 필드와 규칙은 [여러 Grafana 인스턴스](#여러-grafana-인스턴스)를 참고하세요.

### 2. MCP 서버 등록

서버가 인스턴스 파일을 읽으므로 `env`는 필요 없습니다.

**Claude Code** — user 스코프로 등록하면 모든 프로젝트에서 쓸 수 있습니다 (`~/.claude.json`에 저장).

```bash
claude mcp add grafana -s user -- npx @seungje.jun/grafana-mcp
```

프로젝트 루트의 `.mcp.json`으로 팀과 공유하려면 `-s project`를 사용합니다.

**다른 MCP 클라이언트** (Claude Desktop 등) — 클라이언트의 MCP 설정에 아래를 추가합니다.

```json
{
  "mcpServers": {
    "grafana": {
      "command": "npx",
      "args": ["@seungje.jun/grafana-mcp"]
    }
  }
}
```

클라이언트를 재시작하면(Claude Code는 새 세션 시작) MCP 툴이 활성화됩니다.

### 소스에서 직접 빌드

```bash
git clone https://github.com/ninanung/grafana-mcp.git
cd grafana-mcp
npm install
npm run build
claude mcp add grafana -s user -- node /path/to/grafana-mcp/dist/cli.js
```

다른 클라이언트에서는 위 JSON에서 `"command": "node"`, `"args": ["/path/to/grafana-mcp/dist/cli.js"]`로 바꿔 씁니다.

### 환경변수로 단일 인스턴스 사용

기존 env 방식도 그대로 동작합니다. `GRAFANA_URL` + 인증 변수 1개가 이름 `default`인 인스턴스로 등록되며, 인스턴스 파일이 함께 있으면 병합됩니다.

```bash
claude mcp add grafana -s user \
  -e GRAFANA_URL=https://grafana.example.com \
  -e GRAFANA_SERVICE_ACCOUNT_TOKEN=glsa_xxx \
  -- npx @seungje.jun/grafana-mcp
```

```json
{
  "mcpServers": {
    "grafana": {
      "command": "npx",
      "args": ["@seungje.jun/grafana-mcp"],
      "env": {
        "GRAFANA_URL": "https://grafana.example.com",
        "GRAFANA_SERVICE_ACCOUNT_TOKEN": "glsa_xxx"
      }
    }
  }
}
```

### 여러 Grafana 인스턴스

URL + 인증 정보 쌍을 원하는 만큼 등록하고, MCP 설정 수정이나 재시작 없이 대화 중에 전환하며 쓸 수 있습니다.

```json
{
  "default": "dev",
  "instances": [
    { "name": "dev", "url": "https://grafana-dev.example.com", "service_account_token": "glsa_xxx" },
    { "name": "prod", "url": "https://grafana.example.com", "service_account_token": "glsa_xxx" },
    { "name": "team-b", "url": "https://grafana.example.com", "api_key": "eyXxx...", "org_id": 2 }
  ]
}
```

- **인스턴스별 필드**: `url`(필수), 인증 정보 1개(`service_account_token` / `cloud_access_policy_token` / `api_key` / `username` + `password`), 선택 `name`, `org_id`, `tls_skip_verify`.
- **이름은 자유롭게**(`dev`, `qa`, `team-b` 등) 붙이며 대소문자 구분 없이 매칭됩니다. `name`을 생략하면 URL의 hostname을 이름으로 씁니다. 이름은 중복될 수 없습니다.
- **기본 인스턴스**: `default`로 지정한 인스턴스, 없으면 첫 번째 항목. 감싸는 객체 없이 인스턴스 배열만 써도 됩니다.
- **전환**: `use_instance name="prod"`로 세션의 활성 인스턴스를 바꾸고, 아무 툴에나 `instance: "prod"`를 넘기면 그 호출만 해당 인스턴스로 갑니다. Grafana 툴 결과(에러 포함)에는 `[instance: <이름>]`이 붙어 어느 Grafana의 응답인지 항상 보입니다.
- **핫 리로드**: 파일을 수정하면 다음 툴 호출부터 반영됩니다. 수정한 파일이 잘못되었으면 이전 목록을 그대로 쓰고 결과에 경고를 붙입니다.
- **소스 병합**: 파일, `GRAFANA_INSTANCES`, `GRAFANA_URL`(이름 `default`로 등록)을 함께 쓸 수 있습니다. 최소 1개는 등록되어야 하며, 없으면 설정 안내와 함께 서버가 시작되지 않습니다.
- 파일에 인증 정보가 평문으로 저장되므로 `chmod 600 ~/.grafana-mcp/instances.json`으로 권한을 제한하세요 (다른 사용자가 읽을 수 있으면 서버가 경고합니다).

### 인증 방식

인스턴스마다 인증 정보 1개가 필요합니다. 인스턴스 파일에서는 필드명을, `GRAFANA_URL` 인스턴스에서는 환경변수를 씁니다. 위에서부터 순서대로 확인하며, 먼저 설정된 값을 사용합니다.

| 인스턴스 파일 필드 | 환경변수 | 사용 시점 |
|-------------------|---------|----------|
| `service_account_token` | `GRAFANA_SERVICE_ACCOUNT_TOKEN` | Grafana 9.1+ (권장) |
| `cloud_access_policy_token` | `GRAFANA_CLOUD_ACCESS_POLICY_TOKEN` | Grafana Cloud |
| `api_key` | `GRAFANA_API_KEY` | 레거시 API Key (10.x에서 deprecated) |
| `username` + `password` | `GRAFANA_USERNAME` + `GRAFANA_PASSWORD` | Basic Auth 폴백 |

Bearer 계열 토큰은 모두 `Authorization: Bearer <token>` 헤더로 전송합니다. 어떤 종류의 토큰인지는 서버가 신경 쓰지 않고 설정된 것을 그대로 씁니다.

### 환경 변수

| 변수 | 설명 |
|------|------|
| `GRAFANA_URL` | Grafana 서버 URL. 이름 `default`인 인스턴스로 등록됩니다. 인스턴스 파일이나 `GRAFANA_INSTANCES`로 1개 이상 등록했다면 생략 가능. |
| `GRAFANA_INSTANCES_FILE` | (선택) 인스턴스 파일 경로. 기본값 `~/.grafana-mcp/instances.json`. [여러 Grafana 인스턴스](#여러-grafana-인스턴스) 참고. |
| `GRAFANA_INSTANCES` | (선택) 인스턴스 객체의 JSON 배열 (파일의 `instances`와 같은 형식). 파일·`GRAFANA_URL`과 병합됩니다. 예: `[{"name":"prod","url":"...","service_account_token":"..."}]` |
| `GRAFANA_ORG_ID` | (선택) `GRAFANA_URL` 인스턴스에 `X-Grafana-Org-Id` 헤더로 전송. 다중 조직 환경에서 사용. |
| `GRAFANA_TLS_SKIP_VERIFY` | (선택) `true`/`1` 설정 시 `GRAFANA_URL` 인스턴스의 TLS 검증을 건너뜀 (자체 서명 인증서용). |
| `GRAFANA_MCP_LOG` | (선택) 로그 레벨: `debug`, `info`(기본), `warn`, `error`, `silent`. MCP stdio 채널을 보호하기 위해 로그는 stderr로만 보냅니다. |
| `GRAFANA_MCP_AUDIT_LOG` | (선택) 감사 로그 파일 경로. 기본값 `~/.grafana-mcp/audit.log`. `off`로 설정하면 비활성화. 각 줄은 툴 이름·인자·소요 시간·상태를 담은 JSON. |
| `GRAFANA_MCP_CACHE` | (선택) `off` 설정 시 디스크 로그 캐시 비활성화. |
| `GRAFANA_MCP_CACHE_PATH` | (선택) 로그 캐시 파일 경로. 기본값 `~/.grafana-mcp/log-cache.json`. |
| `GRAFANA_MCP_CACHE_TTL_DATASOURCES_MS` | (선택) 로그 데이터소스 목록 캐시 TTL. 기본 `86400000` (24h). |
| `GRAFANA_MCP_CACHE_TTL_LABELS_MS` | (선택) Loki 라벨 키 캐시 TTL. 기본 `86400000` (24h). |
| `GRAFANA_MCP_CACHE_TTL_LABEL_VALUES_MS` | (선택) Loki 라벨 값 캐시 TTL. 기본 `3600000` (1h). |
| `GRAFANA_MCP_CACHE_TTL_SERVICE_MS` | (선택) `{서비스 → (ds_uid, label)}` 매핑 캐시 TTL. 기본 `3600000` (1h). |

## 도구

Grafana를 호출하는 모든 툴은 선택 인자 `instance`를 받아, 그 호출만 등록된 다른 인스턴스로 보낼 수 있습니다.

| 도구 | 설명 |
|------|------|
| `list_instances` | 등록된 인스턴스(이름·URL·인증 종류·소스)와 활성/기본 인스턴스 표시. 인증 값은 출력하지 않음 |
| `use_instance` | 세션의 활성 인스턴스 전환 |
| `self_test` | 헬스 체크 — 연결·버전·인증 + capability 프로브(`list_datasources`/`proxy_uid`/`ds_query`)와 권장 호출 패턴 안내. 인증 정보가 무효·만료(401)면 교체 안내 |
| `list_datasources` | 설정된 모든 데이터소스 나열 |
| `search_dashboards` | 쿼리/태그/타입으로 대시보드 검색 |
| `get_dashboard` | uid로 대시보드 전체 JSON 조회 |
| `extract_dashboard_queries` | 대시보드의 패널 쿼리(LogQL/PromQL)와 `datasource_uid`를 추출. 대시보드 URL 한 번에 `query_logs.raw_logql` 인자를 얻을 수 있음 |
| `list_log_datasources` | 로그 타입 데이터소스(Loki/ES/CloudWatch/OpenSearch/Splunk)만 필터. 캐시 사용 |
| `list_services` | Loki 라벨에서 수집한 서비스명 목록. `query_logs` 호출 전 이름 확인에 유용 |
| `query_logs` | 서비스/시간대/레벨 기준 로그 조회. 로그 데이터소스와 서비스 라벨 자동 탐지. 다중 라벨/고급 쿼리는 `raw_logql` 사용. uid-proxy가 없으면(`Grafana <9.0`) `/api/ds/query`로 폴백. 출력 모드: `raw` / `summarize` / `json` |
| `get_log_cache` | 현재 캐시 상태(로그 DS, 라벨, 해석된 서비스) 확인 |
| `refresh_log_cache` | 특정 서비스 매핑 무효화 또는 전체 초기화 |
| `export_log_cache` | 로그 캐시를 JSON 파일로 내보내기 |
| `import_log_cache` | JSON 파일에서 로그 캐시 가져오기 (merge/replace) |

## 사용 예시

MCP 클라이언트가 오케스트레이션하는 전형적인 자연어 흐름:

1. 사용자: "최근 30분간 api 서비스의 에러 로그 보여줘."
2. `query_logs`를 `service: "api"`, `level: "error"`, `time_from: "now-30m"`으로 호출 → 서버가 `service="api"` 라벨을 가진 Loki 데이터소스를 자동으로 찾아 LogQL을 실행.
3. (첫 호출) 서비스 → 데이터소스/라벨 매핑이 캐시에 저장되어 이후 호출은 탐지 단계를 건너뜀.
4. 사용자: "그 에러들 패턴별로 정리해줘." → 같은 호출을 `output: "summarize"`로 실행하면 패턴 그룹핑 결과 반환.
5. 사용자: "어떤 서비스들이 있더라?" → `list_services` 호출로 전체 서비스 목록 반환.
6. 사용자: "prod에서도 똑같이 봐줘." → `use_instance name="prod"` 후 같은 `query_logs`가 prod로 실행. "dev랑 비교해줘"는 `instance: "dev"`를 넘긴 1회성 `query_logs`로 처리 가능.

서비스명에 오탈자가 있으면 `query_logs`가 가까운 이름을 제안합니다 (예: `Did you mean: checkout, checkout-api?`).

## 자동 탐지 동작 방식

`query_logs`는 대상 데이터소스와 라벨을 다음 절차로 스스로 결정합니다.

1. 전체 데이터소스 중 로그 타입(Loki/ES/CloudWatch/OpenSearch/Splunk)만 추림.
2. 각 Loki 데이터소스에서 `/loki/api/v1/labels`를 호출해 서비스 라벨 후보(`service`, `service_name`, `app`, `app_name`, `application`, `container`, `job`)를 먼저 훑고, 나머지 라벨을 이어서 훑음.
3. 각 후보 라벨의 값 목록을 가져와 요청된 `service` 이름이 있는지 확인.
4. `(datasource, label)` 매칭이 정확히 1개면 자동 선택. 2개 이상이면 `datasource_uid`로 구분 요청. 0개면 유사 이름 제안.
5. 해석된 `(service → ds_uid, label)`는 캐시에 저장됨. `refresh: true` 또는 `refresh_log_cache`로 강제 재탐지 가능.

자동 탐지는 현재 Loki만 지원합니다. Elasticsearch / CloudWatch / Splunk는 `datasource_uid`와 `service_label`을 명시적으로 전달해야 하며, Loki 전용 필터는 적용되지 않습니다.

## 출력 모드

`query_logs`의 `output` 인자:

- `raw` (기본): `<ISO timestamp>  <log line>` — 터미널에서 바로 읽기 좋음.
- `summarize`: 라인을 정규화(숫자 → `N`, UUID → `UUID`)해 패턴별로 그룹핑하고 빈도수와 샘플을 반환. 라인이 많거나 노이즈가 심할 때 사용.
- `json`: `{ ts, line, labels }` 구조화 객체 — 후처리용.

## 캐시

- **로그 캐시**: `~/.grafana-mcp/log-cache.json`에 영구 저장. Grafana 기본 URL(`org_id`가 있으면 URL + `org_id`)별로 분리되어 멀티 인스턴스 충돌 방지.
- 카테고리별로 별도 TTL을 가짐 (데이터소스 / 라벨 / 라벨 값 / 서비스 매핑) — 위 환경변수 표 참고.
- 캐시된 서비스 매핑이 이후 실패하면(예: 라벨이 바뀐 경우) 자동으로 무효화되어 다음 호출에서 재탐지.
- `get_log_cache`로 조회, `refresh_log_cache`로 초기화, `export_log_cache` / `import_log_cache`로 팀원 간 공유.

### 캐시 위치 및 초기화

| 캐시 | 위치 | 초기화 방법 |
|------|------|-------------|
| 로그 캐시 | `~/.grafana-mcp/log-cache.json` | `refresh_log_cache all=true` 호출 또는 파일 삭제 |

캐시 파일은 일반 JSON이므로 직접 열어서 확인·수정·백업해도 안전합니다.

## 안전장치 및 제약

- **읽기 전용**: Grafana 상태를 변경하는 엔드포인트는 노출하지 않습니다. 대시보드/데이터소스 CRUD, 알럿 변경 없음.
- **stdio 로그 보호**: 모든 로그는 stderr로 보내 MCP stdio 채널을 깨끗하게 유지.
- **TLS 검증 스킵**: `GRAFANA_TLS_SKIP_VERIFY=true` / `tls_skip_verify: true`는 `NODE_TLS_REJECT_UNAUTHORIZED=0`을 프로세스 전역으로 설정합니다. 인스턴스가 여러 개일 때 하나라도 켜면 **모든** 인스턴스의 TLS 검증이 꺼집니다 (기동 시와 `list_instances`에서 경고). 신뢰 가능한 네트워크의 자체 서명 Grafana에서만 사용하세요.
- **인증 정보 파일**: `instances.json`에는 토큰이 평문으로 저장됩니다. `chmod 600`으로 유지하세요. 다른 사용자가 읽을 수 있으면 서버가 경고합니다.
- **시크릿 로그 금지**: 인증 토큰은 감사 로그에 기록되지 않습니다.

## 라이선스

[MIT](./LICENSE)
