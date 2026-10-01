# Claim Ledger Protocol

## 1. Claim record

首版 claim 至少包含：

```json
{
  "claim_id": "CLM-000001",
  "project": "homology-operator",
  "statement": "...",
  "formal_statement": null,
  "assumptions": [],
  "dependencies": [],
  "status": "PROPOSED",
  "evidence_ids": [],
  "counterexample_ids": [],
  "proof_artifact_ids": [],
  "literature_refs": [],
  "created_by": "...",
  "created_at": "...",
  "updated_at": "..."
}
```

Statement 一旦进入验证阶段不得静默修改。任何量词、假设或结论变化必须创建新 revision，并记录 supersedes 关系。

## 2. Status semantics

### PROPOSED

只有固定 statement，没有足够验证。

### FINITE_VERIFIED

在明确写出的有限 universe 中没有反例。

必须记录 universe 版本，例如：

```text
connected unlabeled graphs n<=8
```

或：

```text
binary quotient beta<=3, n<=10, weights in {1,2,3}
```

这不是一般证明。

### SYMBOLICALLY_VERIFIED

关键恒等式/有限代数步骤已被 CAS 或独立 symbolic checker 验证，但一般数学逻辑尚未达到 human-proof / formal-proof 状态。

### HUMAN_PROVED

存在完整、可审阅的一般证明 artifact，并已通过至少一个独立 adversarial reviewer。

该状态仍不同于 proof assistant kernel verification。

### FORMALLY_PROVED

指定 formal theorem 已由目标 proof assistant/kernel 接受，并保存：

- source；
- tool/version；
- theorem name；
- build hash/result。

### REFUTED

存在一个满足 assumptions 的明确 counterexample。

反例必须可重放；模型声称“我觉得这里不成立”不能产生 REFUTED。

## 3. Evidence types

首版：

- `finite_enumeration`；
- `exact_counterexample`；
- `symbolic_identity`；
- `numeric_experiment`；
- `human_proof`；
- `adversarial_review`；
- `formal_proof`；
- `literature_source`。

数值实验不能单独把一般数学命题推进到 HUMAN_PROVED。

## 4. State transitions

允许的主路径：

[
	ext{PROPOSED}
	o
	ext{FINITE_VERIFIED}
	o
	ext{HUMAN_PROVED}
	o
	ext{FORMALLY_PROVED}.
]

也允许：

[
	ext{PROPOSED}
	o
	ext{SYMBOLICALLY_VERIFIED}
	o
	ext{HUMAN_PROVED}.
]

任意非终止状态都可转：

[
	o	ext{REFUTED}.
]

禁止：

- LLM 自己把自己的 proof 直接标成 HUMAN_PROVED；
- FINITE_VERIFIED 自动升级为 HUMAN_PROVED；
- numeric confidence threshold 产生 PROVED；
- dependency 被 refute 后仍静默保持下游 PROVED 状态。

## 5. Dependency invalidation

如果 claim (A) 依赖 (B)，而 (B) 被 REFUTED：

- A 的 proof artifact 必须重新检查；
- 若没有另一条独立证明路径，A 标记为 blocked/review-required；
- UI/报告必须显式显示 broken dependency。

这一步是系统和普通“数学聊天历史”的核心区别之一。

## 6. Agent permissions

Agent 只能提出：

```text
proposed_transition:
  claim_id
  from
  to
  evidence_ids
  rationale
```

规则层决定 transition 是否满足契约。

Counterexample Hunter 可以提交 counterexample artifact，但不能直接改其他 claim。

Formalizer 只能在 proof assistant 真正通过后提交 formal-proof evidence。

## 7. Audit log

每次状态变化必须 append-only 记录：

- actor；
- old/new status；
- evidence ids；
- model/tool/version；
- timestamp；
- source revision。

实验报告必须能从 audit log 重建最终 ledger。
