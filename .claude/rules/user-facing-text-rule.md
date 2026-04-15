# 사용자 노출 텍스트 언어 규칙

## 원칙

MCP 도구가 반환하는 **사용자 노출 텍스트**(안내문, 주의사항, 에러 메시지, 요약 문구 등)는 **기본 영어(English)** 로 작성한다.

## 이유

MCP 서버는 사용자가 AI와 어떤 언어로 대화 중인지 알 수 없다. 도구 결과는 LLM이 받아 사용자에게 전달하므로, **중립 언어(영어)** 로 작성하면 LLM이 현재 대화 언어에 맞춰 자연스럽게 풀어서 전달한다. 반대로 특정 언어(예: 한국어)로 고정하면 다른 언어 사용자에게 원문이 그대로 노출될 수 있다.

## 적용 범위

- **영어로 작성**: `ToolResult.content[].text`로 반환되는 모든 문자열
  - 안내/주의 메시지 (notes)
  - 에러·실패 메시지
  - 요약/헤더 (`summarize`, `Notes:`, `Cache summary:` 등)
  - 캐시 적중/미스 태그 (`[cached]`, `[fresh]` 등)
- **영어로 작성**: 툴 `description`과 `inputSchema` property `description`
- **언어 제약 없음**: 코드 주석, 커밋 메시지, 팀 문서(README 본문 등), 규칙 파일(.claude/rules/*.md)

## 예시

```typescript
// O
notes.push(`Auto-injected LIMIT ${maxRows}.`);
return { content: [{ type: "text", text: "Table not found." }] };

// X
notes.push(`LIMIT ${maxRows}을 자동 주입했습니다.`);
return { content: [{ type: "text", text: "테이블을 찾을 수 없습니다." }] };
```

## 예외

사용자가 명시적으로 "이 문구는 한국어로 유지" 등을 요구한 경우에만 예외 적용.
