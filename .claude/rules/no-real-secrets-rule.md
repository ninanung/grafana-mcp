# 실제 값 하드코딩 금지 규칙

## 원칙

코드·문서·규칙 파일 등 저장소에 커밋되는 모든 파일에 **실제 시크릿, 내부 URL, 인증 정보**를 직접 넣지 않는다. 반드시 플레이스홀더나 예시 값으로 대체한다.

## 금지 대상

- API 토큰·키 (Grafana SA token, API key 등)
- 비밀번호, 인증서, private key
- 내부/사내 도메인 URL (예: `grafana.내부도메인.com`)
- 실제 사용자 이메일·계정 ID
- 실제 데이터소스 UID, 대시보드 UID 등 인스턴스 고유 식별자

## 허용되는 플레이스홀더 예시

| 유형 | 플레이스홀더 |
|------|-------------|
| URL | `https://grafana.example.com` |
| SA 토큰 | `glsa_xxx` |
| API 키 | `eyXxx...` |
| 비밀번호 | `your-password` |
| 데이터소스 UID | `ds_example_uid` |
| 대시보드 UID | `dash_example_uid` |
| 이메일 | `user@example.com` |

## 적용 범위

- `src/**` 소스 코드 (문자열 리터럴, 주석)
- `README.md`, `README_kr.md`
- `.claude/rules/*.md` 내 예시 코드 블록
- 테스트 파일, 설정 예시 파일

## 예외

- 환경변수 **이름**(키)은 그대로 사용 가능 (`GRAFANA_URL`, `GRAFANA_SERVICE_ACCOUNT_TOKEN` 등)
- npm 패키지 스코프명(`@seungje.jun/grafana-mcp`)은 공개 정보이므로 허용
- GitHub 저장소 URL(`https://github.com/ninanung/grafana-mcp`)은 공개 정보이므로 허용

## 체크리스트

파일을 추가·수정할 때 확인:

- [ ] 문자열 리터럴에 실제 토큰·키가 포함되어 있지 않은가
- [ ] 예시 URL이 `example.com` 등 예약 도메인을 사용하는가
- [ ] 주석이나 문서의 코드 블록에 실제 인증 정보가 노출되지 않는가
