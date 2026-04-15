# grafana-mcp

[![npm version](https://img.shields.io/npm/v/@seungje.jun/grafana-mcp.svg)](https://www.npmjs.com/package/@seungje.jun/grafana-mcp)
[![license](https://img.shields.io/npm/l/@seungje.jun/grafana-mcp.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@seungje.jun/grafana-mcp.svg)](https://nodejs.org)

Grafana API 중 **자연어 기반 로그 조회**에 집중한 부분을 MCP(Model Context Protocol) 서버로 노출합니다. 목표는 "api 서비스의 최근 30분 에러 로그 보여줘" 같은 자연어를 그대로 받아 LogQL·라벨·datasource uid를 직접 다루지 않고도 실제 로그 라인을 돌려주는 것입니다.

로그 데이터소스 목록, Loki 라벨, 그리고 "서비스명 → (데이터소스, 라벨)" 매핑을 디스크에 캐싱하여 반복 호출 시 라벨 스캔을 생략합니다.

[English README](./README.md)

## 설치 및 설정

### npx (설치 불필요)

`~/.mcp.json`에 아래 내용을 추가합니다.

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

### 소스에서 직접 빌드

```bash
git clone https://github.com/ninanung/grafana-mcp.git
cd grafana-mcp
npm install
npm run build
```

```json
{
  "mcpServers": {
    "grafana": {
      "command": "node",
      "args": ["/path/to/grafana-mcp/dist/cli.js"],
      "env": {
        "GRAFANA_URL": "https://grafana.example.com",
        "GRAFANA_SERVICE_ACCOUNT_TOKEN": "glsa_xxx"
      }
    }
  }
}
```

Claude Code를 재시작하면 MCP 툴이 활성화됩니다.

### 인증 방식

아래 중 하나가 필요합니다. 위에서부터 순서대로 확인하며, 먼저 설정된 값을 사용합니다.

| 변수 | 사용 시점 |
|------|----------|
| `GRAFANA_SERVICE_ACCOUNT_TOKEN` | Grafana 9.1+ (권장) |
| `GRAFANA_CLOUD_ACCESS_POLICY_TOKEN` | Grafana Cloud |
| `GRAFANA_API_KEY` | 레거시 API Key (10.x에서 deprecated) |
| `GRAFANA_USERNAME` + `GRAFANA_PASSWORD` | Basic Auth 폴백 |

Bearer 계열 토큰은 모두 `Authorization: Bearer <token>` 헤더로 전송합니다. 어떤 종류의 토큰인지는 서버가 신경 쓰지 않고 설정된 것을 그대로 씁니다.

### 환경 변수

| 변수 | 설명 |
|------|------|
| `GRAFANA_URL` | Grafana 서버 URL (단일 인스턴스 모드, `GRAFANA_INSTANCES` 미설정 시 필수) |
| `GRAFANA_INSTANCES` | (선택) 멀티 인스턴스 모드 JSON 배열. 예: `[{"name":"prod","url":"...","service_account_token":"..."},{"name":"dev","url":"...","api_key":"..."}]`. 설정 시 툴 호출에 `instance: "prod"`로 대상을 지정합니다. 생략 시 첫 번째 항목을 사용합니다. |
| `GRAFANA_ORG_ID` | (선택) `X-Grafana-Org-Id` 헤더로 전송. 다중 조직 환경에서 사용. |
| `GRAFANA_TLS_SKIP_VERIFY` | (선택) `true`/`1` 설정 시 TLS 검증을 건너뜀 (자체 서명 인증서용). |
| `GRAFANA_MCP_LOG` | (선택) 로그 레벨: `debug`, `info`(기본), `warn`, `error`, `silent`. MCP stdio 채널을 보호하기 위해 로그는 stderr로만 보냅니다. |
| `GRAFANA_MCP_AUDIT_LOG` | (선택) 감사 로그 파일 경로. 기본값 `~/.grafana-mcp/audit.log`. `off`로 설정하면 비활성화. 각 줄은 툴 이름·인자·소요 시간·상태를 담은 JSON. |
| `GRAFANA_MCP_CACHE` | (선택) `off` 설정 시 디스크 로그 캐시 비활성화. |
| `GRAFANA_MCP_CACHE_PATH` | (선택) 로그 캐시 파일 경로. 기본값 `~/.grafana-mcp/log-cache.json`. |
| `GRAFANA_MCP_CACHE_TTL_DATASOURCES_MS` | (선택) 로그 데이터소스 목록 캐시 TTL. 기본 `86400000` (24h). |
| `GRAFANA_MCP_CACHE_TTL_LABELS_MS` | (선택) Loki 라벨 키 캐시 TTL. 기본 `86400000` (24h). |
| `GRAFANA_MCP_CACHE_TTL_LABEL_VALUES_MS` | (선택) Loki 라벨 값 캐시 TTL. 기본 `3600000` (1h). |
| `GRAFANA_MCP_CACHE_TTL_SERVICE_MS` | (선택) `{서비스 → (ds_uid, label)}` 매핑 캐시 TTL. 기본 `3600000` (1h). |

## 도구

| 도구 | 설명 |
|------|------|
| `self_test` | 헬스 체크 — 연결·버전·인증 + capability 프로브(`list_datasources`/`proxy_uid`/`ds_query`)와 권장 호출 패턴 안내 |
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

- **로그 캐시**: `~/.grafana-mcp/log-cache.json`에 영구 저장. Grafana 기본 URL별로 분리되어 멀티 인스턴스 충돌 방지.
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
- **TLS 검증 스킵**: `GRAFANA_TLS_SKIP_VERIFY=true`는 `NODE_TLS_REJECT_UNAUTHORIZED=0`을 프로세스 전역으로 설정합니다. 신뢰 가능한 네트워크의 자체 서명 Grafana에서만 사용하세요.
- **시크릿 로그 금지**: 인증 토큰은 감사 로그에 기록되지 않습니다.

## 라이선스

[MIT](./LICENSE)
