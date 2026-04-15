# TypeScript 우선 규칙

## 원칙

프로젝트에 추가하는 모든 코드 파일은 **기본적으로 TypeScript(`.ts`)** 로 작성한다.
JavaScript(`.js`, `.mjs`, `.cjs`)는 아래 예외에 해당할 때만 사용한다.

## 이유

- 명확한 타입·인터페이스가 있으면 코드 탐색 시 구현체를 열어보지 않고도 함수 시그니처로 호출 관계를 파악할 수 있어, 파일 열람 횟수와 컨텍스트 사용량이 줄어든다
- 리팩토링 시 `tsc`가 깨진 참조를 즉시 잡아준다 (런타임에 발견 ❌)
- `src/interfaces/` 분리 규칙과 결이 맞아 모듈 경계가 타입으로 문서화된다

## 예외 (JS 허용 조건)

아래 중 **하나라도 해당**하면 JS로 작성해도 된다.

1. **외부 도구가 TS를 지원하지 않는 경우**
   - 해당 도구/런타임이 TS 설정 파일을 로드할 수 없을 때
   - 예: 일부 빌드 도구의 구버전 설정 파일

2. **TS 로더가 과도한 추가 의존성을 요구하는 경우**
   - TS 전환을 위해 `jiti`, `ts-node`, `tsx` 등 로더가 필요하고, 그 의존성이 해당 파일의 효용 대비 과하다고 판단될 때
   - 예: 린터 설정 1개를 위해 로더를 까는 게 과한 프로젝트. 반대로 본 프로젝트의 `eslint.config.ts`는 일관성 이점이 크다고 판단해 `jiti`를 도입함

3. **런타임에서 JS만 허용하는 경우**
   - Node가 `.ts`를 직접 실행하지 못하는 환경에서 실행되는 스크립트 (`dist/` 산출물 등)
   - 이건 빌드 산출물이므로 규칙 적용 대상이 아님

## 적용 체크리스트

새 파일을 추가할 때 확인:

- [ ] 확장자가 `.ts`인가
- [ ] 타입이 필요한 값(함수 인자, 반환값, 외부에 노출되는 객체)에 타입이 명시되어 있는가
- [ ] 타입/인터페이스 정의가 있다면 `src/interfaces/`에 별도 파일로 두었는가 (interface-rule.md 참고)
- [ ] JS로 작성한다면, 위 예외 중 어떤 조건에 해당하는지 커밋 메시지나 PR 설명에 명시했는가

## 예시

```typescript
// O — 타입이 명시되어 호출부에서 시그니처만 봐도 사용법이 드러남
import type { LogLine } from "@/interfaces/loki.js";

export function renderRaw(lines: LogLine[]): string {
  return lines.map((l) => `${l.timestampIso}  ${l.line}`).join("\n");
}
```

```javascript
// X — 타입 없이 JS로 작성. 구현을 열어보지 않으면 lines의 구조를 알 수 없음
export function renderRaw(lines) {
  return lines.map((l) => `${l.timestampIso}  ${l.line}`).join("\n");
}
```
