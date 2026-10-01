# AI Mathematics Reliability Benchmark

## 1. Primary question

研究：

> evidence-gated multi-agent architecture 是否能显著降低数学错误 claim 被错误接受的概率？

因此首要指标是 false acceptance，而不是只看 solve rate。

## 2. Claim categories

M0 至少 100 条，逐步扩到 500 条。类别必须平衡：

### C1. Correct theorem

陈述正确，并有可核验证明。

### C2. False but plausible

看起来非常自然，但存在小反例。

### C3. Missing assumption

加一个条件才正确，例如：

- 非零；
- 连通；
- 正权；
- 有限维；
- compact；
- characteristic restriction。

### C4. Finite-universe trap

在较小搜索范围内全部成立，但更大规模出现反例。

### C5. Corrupted proof

命题正确，但提供的人为 proof artifact 含一处关键错误。

### C6. Equivalent reformulation trap

两个陈述非常接近，但量词/常数/边界不同，测试模型是否偷换命题。

## 3. Sources

优先使用：

- homology-operator finite-universe 自动生成的真/假 claim；
- TILO 小图 exact universe；
- 基础代数、图论、分析中的可独立核验题；
- 人为注入的一步错误证明。

开放猜想不用于计算“正确/错误分类准确率”，只用于 unresolved-behavior stress test。

## 4. Systems

### A. Single

单模型一次 proof/review。

### B. Critic

prover + critic。

### C. Swarm

多个角色，但没有强制 ledger/evidence gate。

### D. Ledger

角色分工 + claim ledger + exact oracle + dependency invalidation。

### E. Formal

D + proof assistant verification on the subset that can be formalized.

模型、prompt、工具和 token budget 必须记录；不同系统不能偷偷使用不同 ground-truth 信息。

## 5. Metrics

### False Acceptance Rate

[
FAR=
rac{\#\text{false claims accepted}}
{\#\text{false claims}}.
]

这是首要指标。

### False Rejection Rate

正确 claim 被错误拒绝的比例。

### Counterexample Recall

对有小反例的 false claim：

[
CR=
rac{\#\text{找到有效反例}}
{\#\text{存在目标范围反例}}.
]

### Assumption Recovery

缺假设题中，系统能否识别并提出最小合理条件。

### Proof Defect Detection

人为 corrupted proof 中关键错误的检出率。

### Unresolved Discipline

对于没有足够 evidence 的 claim，系统是否正确保持 unresolved，而不是强行给出 proved/refuted。

### Resource metrics

- token；
- wall time；
- tool calls；
- human review minutes；
- formalization effort。

## 6. No-leak protocol

生成 benchmark 后：

- ground truth 与测试输入分离；
- agent 不读取 answer key；
- finite universe oracle 只暴露被允许的查询接口；
- literature agent 对人工 synthetic claim 不应通过全文搜索直接看到 answer annotation。

## 7. Failure archive

每个 false acceptance 必须保存：

- 原 claim；
- 被接受的错误 proof；
- 哪个 gate 失效；
- 最小反例；
- 哪个系统层本应阻止它。

目标不是隐藏系统失败，而是建立 failure taxonomy。

## 8. Success criterion

M0 成功不是要求“系统很聪明”。

最低研究成功条件是：D 相比 A/B 在相同或可解释增加的资源预算下，显著降低 false acceptance，并且 failure archive 能解释剩余错误来自哪一层。

如果 D 只是增加 token/latency，而 FAR 没有实质下降，则不继续扩张 architecture。
