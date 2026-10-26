---
name: npm-release
description: |
  이 패키지(@seungje.jun/grafana-mcp)를 npm 에 배포한다. Trusted Publishing 이라 로컬 npm publish 없이
  버전 태그를 push 하면 GitHub Actions(.github/workflows/publish.yml)가 빌드·배포한다.
  "배포해줘", "publish", "릴리스", "릴리즈", "npm 올려줘", "버전 올려서 배포", "npm-release" 등 요청 시 자동 트리거.
autoTrigger: true
---

npm 배포를 수행한다. 아래 절차를 순서대로 실행하고, 단계를 임의로 생략하지 않는다.
로컬에서 `npm publish` 를 직접 실행하지 않는다 — 배포 주체는 GitHub Actions 다 (`.claude/rules/npm-publish-rule.md`).

## 0. 인자

- 버전 종류: `patch`(기본) / `minor` / `major`, 또는 명시 버전(예: `0.2.0`)
- 사용자가 안 주면 변경 내용으로 판단한다: 버그픽스·문구·env 추가·의존성 갱신 → patch, 새 도구·인자·출력 형태 변경 → minor, 기존 소비자가 깨지는 변경 → major

## 1. 사전 점검 (하나라도 실패하면 멈추고 사용자에게 알린다)

```bash
node -v                       # package.json engines(>=22) 를 만족해야 함
git status --short            # 비어 있어야 함 (미커밋 변경 금지)
git branch --show-current     # main 이어야 함. 아니면 먼저 main 에 병합
git fetch origin && git log origin/main..main --oneline   # 미푸시 커밋은 있어도 됨 (같이 push 됨)
npm ci --dry-run 2>&1 | grep -i "error"   # 락파일 동기화 확인, 출력 없어야 함
npm run build && npm run lint
npm audit --omit=dev          # 런타임 의존성 취약점. 있으면 사용자에게 알리고 진행 여부 확인
```

- **README 릴리즈 직전 재확인**: `CLAUDE.md` 의 "README 동기화" 5단계를 수행한다.
  1. `git describe --tags --abbrev=0` 로 직전 릴리즈 태그를 찾는다.
  2. `git diff <직전 태그>..HEAD` 로 바뀐 것을 항목으로 뽑는다.
  3. `README.md` 와 `README_kr.md` 를 처음부터 끝까지 line by line 대조한다.
  4. 결과(수정한 줄, 또는 대조한 범위와 "반영할 것 없음")를 보고에 남긴다.
- `package.json` 의 `repository.url` 이 `git+https://github.com/ninanung/grafana-mcp.git` 인지 확인한다 (Trusted Publishing·provenance 매칭 조건).

## 2. 릴리스 노트 준비

`git log <직전 태그>..HEAD --oneline` 으로 변경을 모아 한 줄 요약을 만든다. 사용자에게 보여 주고 버전 종류가 맞는지 짧게 확인한다 (사용자가 이미 버전을 지정했으면 생략).

## 3. 버전 올리고 태그 push

```bash
npm version <patch|minor|major|x.y.z> -m "%s"   # package.json·lockfile 갱신 + 커밋("0.1.4") + v0.1.4 태그
git push --follow-tags origin main
```

- 커밋 메시지는 버전 숫자만 쓴다 (이력의 `0.1.2`, `0.1.3` 과 같은 형식).
- `npm version` 이 만든 태그(`v0.1.4` 형식)가 워크플로 트리거다.
- 태그를 손으로 만들 때도 `v` 접두를 붙인다. `git tag v<버전>` 으로 만든 태그는 `--follow-tags` 로 올라가지 않으므로 `git push origin v<버전>` 으로 따로 push 한다.

## 4. 워크플로 완료 대기 및 검증

```bash
gh run list --workflow=publish.yml --limit 1 --json databaseId,headBranch,status   # run id 확보
gh run watch <run-id> --exit-status --interval 10
npm view @seungje.jun/grafana-mcp@<버전> version dist.attestations --prefer-online   # 새 버전 + provenance 확인
```

- 태그 push 직후에는 run 이 아직 없을 수 있다. 몇 초 뒤 다시 조회하고, `headBranch` 가 `v<버전>` 인지 확인한다.
- `gh run watch` 는 백그라운드로 실행하고 완료 알림을 받는다.
- registry 반영은 몇 분 늦을 수 있다. 워크플로가 성공했는데 `npm view` 가 `E404` 면 잠시 뒤 다시 조회한다.
- 실패 시 `gh run view <run-id> --log-failed` 로 원인을 본다.
  - OIDC 인증 오류·`E403`·`ENEEDAUTH` → npm 쪽 Trusted Publisher 설정이 없거나 값이 다르다. `npm-publish-rule.md` 의 "Trusted Publisher 설정" 값으로 사용자가 직접 고친다.
  - provenance·`repository` 관련 `E422` → `package.json` 의 `repository.url` 을 확인한다.
  - 빌드·설치 실패 → 아직 배포되지 않았으므로 같은 버전을 다시 쓸 수 있다.
    1. 코드를 수정하고 커밋한다.
    2. 태그를 지운다: `git tag -d v<버전> && git push origin :refs/tags/v<버전>`
    3. 새 HEAD 에 같은 태그를 다시 단다: `git tag -a v<버전> -m "<버전>"`
    4. `git push origin main v<버전>` 으로 push 한다.
  - `cannot publish over the previously published versions` → 이미 배포된 버전이다. 버전을 올려 다시 한다.

## 5. 후속

- 로컬 MCP 서버는 클라이언트를 재시작해야 새 버전이 반영된다고 사용자에게 알린다.
- 이 패키지를 버전 고정으로 쓰는 곳이 있으면 새 버전과 env·인자 변경을 알린다.

## 수동 배포 폴백

GitHub Actions 를 못 쓰는 상황에서만 로컬 publish 를 고려한다. `.claude/rules/npm-publish-rule.md` 의 "수동 배포 폴백" 절차(`npm whoami` 가 `seungje.jun` 일 때만, 사용자가 대화형 터미널에서 직접 `npm publish --access public`)를 따른다.
