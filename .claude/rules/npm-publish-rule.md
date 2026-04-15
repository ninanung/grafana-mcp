# npm publish 사전 확인 규칙

## 원칙

`npm publish`를 실행하기 전에는 **반드시** `npm whoami`를 먼저 호출해 현재 로그인된 사용자가 `seungje.jun`인지 확인한다.

## 절차

1. `npm publish` 요청을 받으면, 빌드·dry-run 이전에 `npm whoami`를 먼저 호출한다
2. 결과가 `seungje.jun`이면 publish를 계속 진행한다
3. 결과가 다른 사용자이거나 로그인되지 않은 상태(`ENEEDAUTH` 등)이면, **publish를 즉시 중단**하고 사용자에게 계정 전환 여부를 묻는다
   - 예: "현재 npm 사용자는 `{다른ID}`입니다. `seungje.jun`으로 전환한 뒤 진행할까요? 아니면 현재 사용자로 그대로 publish할까요?"
4. 사용자가 전환을 원하면 `npm login` 안내 또는 토큰 기반 인증 방법을 제시한다
5. 사용자가 현재 계정으로 진행하길 명시적으로 허용한 경우에만 예외적으로 그대로 진행한다

## 이유

이 저장소의 패키지는 `@seungje.jun/grafana-mcp` 스코프에 속한다. 다른 계정으로 publish를 시도하면 실패하거나, 잘못된 스코프로 publish되어 정리 비용이 큰 사고가 발생할 수 있다. publish는 되돌리기 어려운 작업이므로 사전 확인이 필수다.

## 적용 범위

- `npm publish` 본 명령 실행 전 (dry-run은 예외 — 계정 확인 없이 실행 가능)
- `npm publish --tag ...`, `npm publish --access ...` 등 모든 publish 변형 명령
