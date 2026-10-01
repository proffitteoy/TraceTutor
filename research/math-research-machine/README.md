# Math Research Machine

本目录定义 TraceTutor 之外的一条研究实验线：研究如何把多个不可信 LLM、精确计算工具和形式验证器组合成一个低错误率的数学研究系统。

它不是“让 AI 自动给数学题答案”，而是测试：

[
oxed{
	ext{怎样让数学 claim 的状态只由可审计 evidence 推进，而不是由模型自我宣布？}
}
]

现有 TraceTutor 已经有一个适合复用的思想：Agent 只能提出 `state_delta`，正式状态变化必须引用真实 evidence 并经过规则层。本实验把“学习状态”替换为“数学命题状态”。

本目录当前是研究规范，不表示现有教学 API 已经接入该系统；生产教学链路与数学研究实验保持隔离。

## 1. Claim-first architecture

系统的中心对象不是 Chat，也不是 Agent，而是 Claim。

每个数学对象拥有：

- 固定 statement；
- assumptions；
- dependencies；
- evidence；
- counterexamples；
- literature provenance；
- proof artifact；
- formal verification artifact；
- 状态变更历史。

LLM 无权直接把 claim 标成“已证明”。

## 2. 状态机

首版状态：

[
	ext{PROPOSED}
]

[
	ext{FINITE_VERIFIED}
]

[
	ext{SYMBOLICALLY_VERIFIED}
]

[
	ext{HUMAN_PROVED}
]

[
	ext{FORMALLY_PROVED}
]

以及终止状态

[
	ext{REFUTED}.
]

状态只能通过 evidence gate 推进。详细协议见 [CLAIM_LEDGER.md](CLAIM_LEDGER.md)。

## 3. 互相敌对的 Agent 角色

不是让多个 agent 同方向“共同证明”，而是显式分工：

### Proposer

提出可形式化的 lemma / conjecture，并固定量词和 assumptions。

### Prover

只负责构建证明。

### Counterexample Hunter

唯一目标是反驳 claim：

- finite enumeration；
- randomized search；
- symbolic substitution；
- boundary / degenerate case；
- adversarial construction。

### Assumption Auditor

检查：

- 偷换定义；
- 缺失非零条件；
- compactness / finiteness / positivity 等隐藏假设；
- 从有限验证跳到一般命题；
- 不合法交换极限、和、积分等。

### Literature Agent

检查：

- 是否已有同结论；
- 是否只是经典结果重述；
- attribution；
- 假设范围是否真的一致。

### Formalizer

把成熟 proof artifact 转成 Lean/Isabelle/Coq 等形式目标；形式系统没有证明通过时，不允许使用 `FORMALLY_PROVED`。

### Synthesizer

只能消费 Claim Ledger 中有状态和 evidence 的节点，不允许凭聊天历史创造“已经证明”的依赖。

## 4. Proof DAG

研究项目表示为有向无环依赖图：

[
C_0
leftarrow
L_1,L_2
leftarrow
L_3,L_4,L_5.
]

如果 (L_3) 被 `REFUTED`，所有依赖它且没有替代证明路径的 claim 自动进入 blocked / review 状态。

系统必须能回答：

- 主定理还缺哪些 lemma；
- 哪些 lemma 只有 finite evidence；
- 哪些 proof artifact 尚未经过 adversarial review；
- 哪些 dependency 已经失效。

## 5. 第一个实验对象

优先接入两个可自动验证的研究对象：

### A. homology-operator finite universe

优点：

- claim 可由 exact finite oracle 主动攻击；
- 容易产生“看起来很真但其实错”的 conjecture；
- 可以测量 propose → refute → revise → prove 的完整闭环。

### B. TILO / PRC 小图理论审判

优点：

- 小图可 exhaustive；
- graph property 可以独立 exact compute；
- equivalence / approximation / separation 都能建立明确 oracle。

Lobachevsky 等开放难题只作为后续 stress test。系统在开放问题上的首要目标是“不虚假闭合”，不是宣称解决。

## 6. 实验指标

核心指标不是只看 solve rate。

首版至少测：

[
	ext{False Acceptance Rate}
=
rac{	ext{错误 claim 被系统接受为证明}}{	ext{错误 claim 总数}},
]

以及：

- counterexample recall；
- hidden-assumption detection rate；
- valid-proof acceptance；
- formalization success；
- human review time；
- token cost per validated claim；
- blocked-but-correctly-unresolved rate。

Benchmark 设计见 [BENCHMARK.md](BENCHMARK.md)。

## 7. 系统对照组

至少比较：

- A：single LLM；
- B：LLM + critic；
- C：multi-agent without ledger；
- D：multi-agent + claim ledger + exact tools；
- E：D + formal verifier。

真正需要检验的是更重的 evidence architecture 是否显著降低 false acceptance，而不是“回答更长”。

## 8. 实施边界

M0 不修改 TraceTutor 正式学习状态数据库。

建议先建立独立：

```text
research/math-research-machine/
runtime/math-research-machine/
```

作为研究 harness。

只有 benchmark 明确显示该架构有价值后，再决定是否把通用 evidence-state engine 抽成共享包。

## 9. M0 完成标准

- Claim Ledger schema 固定；
- 至少 100 个 benchmark claims；
- 至少包含正确、错误、缺假设、有限验证误导四类；
- exact-tool adapter 至少一个；
- baseline A/B/D 可运行；
- 所有状态变化都有 provenance；
- 主报告同时给 solve rate 与 false acceptance；
- 保存所有失败证明与被抓出的反例。

如果系统只是“多个 agent 输出更多文字”，没有降低错误接受率，就判定该架构未产生研究价值。
