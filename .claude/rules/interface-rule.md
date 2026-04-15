# Interface 규칙

## 인터페이스와 구현체 분리

인터페이스/타입 정의는 `src/interfaces/` 폴더에 별도 파일로 분리한다.

## 파일 구조

```
src/
  interfaces/
    redash-client.ts    # RedashClient 관련 인터페이스
    metadata-cache.ts   # MetadataCache 관련 인터페이스
    schema-cache.ts     # SchemaCache 관련 인터페이스
    tools.ts            # Tool 관련 인터페이스
  redash-client.ts      # 구현체
  metadata-cache.ts     # 구현체
  schema-cache.ts       # 구현체
  tools.ts              # 구현체
```

## 규칙

- 인터페이스 파일명은 구현체 파일명과 동일하게 맞춘다
- 구현체에서 외부에 노출할 인터페이스는 `export type { ... } from "@/interfaces/xxx.js"` 로 re-export한다
- 구현체 내부에서만 쓰는 인터페이스도 `src/interfaces/`에 둔다
- 새 모듈을 추가할 때 인터페이스가 있으면 반드시 `src/interfaces/`에 먼저 정의한다
