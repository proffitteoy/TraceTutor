export type NoteActionType =
  | "chat_summary"
  | "concept_note"
  | "literature_note"
  | "project_decision_record"
  | "experiment_log"

interface BuildDraftInput {
  type: NoteActionType
  title: string
  content: string
  workspace: string
  related: string[]
  createdDate: string
  sources: Array<{ title: string; path: string }>
}

const headingByType: Record<NoteActionType, string> = {
  chat_summary: "Chat Summary",
  concept_note: "Concept Note",
  literature_note: "Literature Note",
  project_decision_record: "Project Decision Record",
  experiment_log: "Experiment Log"
}

export const buildObsidianDraftMarkdown = ({
  type,
  title,
  content,
  workspace,
  related,
  createdDate,
  sources
}: BuildDraftInput) => {
  const relatedLines = related.map(item => `  - "[[${item}]]"`).join("\n")
  const sourceLines = sources
    .map(item => `- ${item.title} (${item.path})`)
    .join("\n")

  return `---
source: iris-terminal
type: ai-draft
status: draft
created: ${createdDate}
workspace: ${workspace}
category: ${type}
related:
${relatedLines || "  - \"[[Iris-Terminal]]\""}
tags:
  - ai-draft
  - knowledge-agent
---

# ${title}

## 类型
${headingByType[type]}

## 摘要

## 正文
${content}

## 来源
${sourceLines || "- (none)"}

## 待人工确认
- [ ] 术语准确性
- [ ] 结论与原始来源一致
- [ ] 是否移动到正式目录
`
}
