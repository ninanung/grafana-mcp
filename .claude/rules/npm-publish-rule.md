# npm 배포 규칙

## 원칙

- 배포는 **`v*` 태그 push** 로 한다. GitHub Actions(`.github/workflows/publish.yml`)가 npm Trusted Publishing(OIDC)으로 빌드·배포한다.
- 로컬에서 `npm publish` 를 직접 실행하지 않는다. 예외는 아래 "수동 배포 폴백" 뿐이다.
- 배포 절차는 `npm-release` 스킬(`.claude/skills/npm-release/SKILL.md`)을 따른다.

## 태그

- 태그가 배포 트리거다. `package.json` 의 `version` 앞에 `v` 를 붙인다.
  - 정식 릴리즈: `0.1.4` → `v0.1.4`
  - 프리릴리즈: `0.1.4-beta.0` → `v0.1.4-beta.0`
- 태그는 배포할 커밋에 단다. 보통 `npm version` 이 만든 버전 bump 커밋이다.
- npm 에 이미 있는 버전의 태그는 push 하지 않는다. 같은 버전은 다시 배포할 수 없어 워크플로가 실패한다.

## 이유

- 배포 계정·2FA·로컬 빌드 환경 차이가 결과물에 섞이지 않는다. CI 가 lockfile 로 `npm ci` 한 뒤 빌드한다.
- npm registry 만으로는 tarball 이 어느 커밋에서 나왔는지 알 수 없다. 태그와 provenance 가 그 연결고리다. 롤백·hotfix 분기·릴리즈 노트가 태그에 의존한다.

## Trusted Publisher 설정 (최초 1회)

npm 쪽 연결이 없으면 워크플로의 publish 단계가 OIDC 인증 오류로 실패한다. 설정 값은 아래와 같다.

| 항목 | 값 |
|------|----|
| Provider | GitHub Actions |
| Repository | `ninanung/grafana-mcp` |
| Workflow | `publish.yml` |

- CLI: `npm trust github @seungje.jun/grafana-mcp --repo ninanung/grafana-mcp --file publish.yml --allow-publish`
- 웹: npmjs.com → 패키지 Settings → Trusted Publisher
- 2FA 가 필요하므로 사용자가 대화형 터미널에서 직접 실행한다.
- `package.json` 의 `repository.url` 이 위 repo 와 일치해야 provenance 검증을 통과한다.

## 수동 배포 폴백

GitHub Actions 를 쓸 수 없을 때만 로컬에서 배포한다.

1. `npm whoami` 를 먼저 실행한다. 결과가 `seungje.jun` 이어야 한다.
2. 다른 사용자이거나 로그인되지 않았으면(`ENEEDAUTH`) 중단하고 사용자에게 계정 전환 여부를 묻는다.
3. 사용자가 대화형 터미널에서 직접 `npm publish --access public` 을 실행한다. 이 세션의 셸은 비대화형이라 OTP·브라우저 인증을 받을 수 없다.
4. 배포가 registry 에 반영된 것을 확인한 뒤 publish 한 커밋에 `v{version}` 태그를 달고 push 한다.
   - 이 태그 push 로 워크플로가 돌지만 같은 버전이라 publish 단계에서 실패한다. 예상된 실패이므로 무시한다.
