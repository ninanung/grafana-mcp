# Import 규칙

## 절대경로 사용

상대경로(`./`, `../`) 대신 `@/` 절대경로를 사용한다.

```typescript
// O
import { RedashClient } from "@/redash-client.js";
import type { ToolResult } from "@/interfaces/tools.js";

// X
import { RedashClient } from "./redash-client.js";
import type { ToolResult } from "../interfaces/tools.js";
```

## 설정

- `tsconfig.json`의 `paths`에 `@/*` -> `src/*` 매핑이 설정되어 있다
- 빌드 시 `tsc-alias`가 dist 출력물의 `@/` 경로를 상대경로로 치환한다
- 외부 패키지(`@modelcontextprotocol/sdk`, `axios` 등)는 그대로 패키지명을 사용한다
