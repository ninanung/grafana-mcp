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

## publish 커밋에 git tag 부여

`npm publish`가 실제로 성공한 경우, **해당 publish가 포함된 커밋**(= publish 시점의 `HEAD`)에 `package.json`의 `version` 값을 기반으로 한 git tag를 반드시 부여한다.

### 태그 네이밍

- 정식 릴리즈: `v{version}` (예: `0.0.1` → `v0.0.1`, `1.2.3` → `v1.2.3`)
- 프리릴리즈: `v{version}` 그대로 (예: `0.0.1-beta.0` → `v0.0.1-beta.0`)
- `v` 접두사는 항상 붙인다

### 절차

1. `npm publish` 성공을 확인한다
2. `git tag v{version}`으로 현재 HEAD에 태그를 단다 (이미 존재하면 사용자에게 중복 여부 확인)
3. `git push origin v{version}`로 원격에 태그를 푸시한다
4. publish에 해당하는 커밋이 아직 푸시되지 않은 상태라면 커밋도 함께 푸시한다

### 이유

publish된 버전이 실제 어느 커밋에서 나왔는지 git 히스토리로 역추적할 수 있어야 한다. npm registry만으로는 tarball의 커밋 해시를 알 수 없으므로, 태그가 유일한 연결고리가 된다. 롤백·hotfix 분기 생성·릴리즈 노트 자동화 모두 이 태그에 의존한다.
