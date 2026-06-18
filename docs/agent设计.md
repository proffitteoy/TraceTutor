
# 一、Agent 层总体定位

你的 Agent 层不要理解成“一个大模型回答问题”，而要理解成：

```text
对话控制器
流程状态机
上下文压缩器
工具调用调度器
Prompt 拼接器
学习任务路由器
```

完整结构应该是：

```text
Iris 前端
  ↓
扣子主 Agent
  ↓
扣子 Workflow
  ↓
意图理解子 Agent
  ↓
工具调用节点
  ↓
你自己的 API 层
  ↓
SQLite 用户状态库 + PgSQL 题目资产库
  ↓
工具结果返回
  ↓
上下文压缩节点
  ↓
主 Agent 组织最终输出
  ↓
Iris 前端渲染
```

核心原则是：

```text
扣子负责“怎么调度”
API 层负责“怎么执行”
SQLite / PgSQL 负责“存什么”
主 Agent 负责“为什么这样做”
子 Agent 负责“把用户话翻译成计划”
```

不要让主 Agent 裸写 SQL。不要让扣子直接变成后端。不要把所有上下文都塞进一个长 Prompt。

---

# 二、扣子上应当拆成哪些 Agent / Workflow

建议分成 1 个主 Agent、4 个子 Agent、若干工具节点。

```text
Main Tutor Agent              主教学 Agent
Intent Planner Agent          意图理解 / 查询计划 Agent
Context Compressor Agent      上下文压缩 Agent
Question Analyzer Agent       题目结构分析 Agent
Review Strategy Agent         复习策略 Agent
```

其中：

```text
主 Agent：总控
子 Agent：窄任务
Workflow：固定流程编排
Plugin / API：实际查库和写库
```

---

# 三、主 Agent 的职责

主 Agent 不应该做太多细节判断。它只负责六件事：

```text
1. 判断当前用户请求属于什么任务
2. 决定要走哪个 Workflow
3. 调用意图理解子 Agent 生成查询计划
4. 调用工具获取 SQLite / PgSQL 数据
5. 组织答案、同类题、复习题、Review
6. 决定哪些状态需要写回
```

主 Agent 的任务类型可以先固定为：

```text
NEW_QUESTION_SOLVE          新题解答
GENERATE_SIMILAR_QUESTION   同类题 / 变式题
REVIEW_OLD_QUESTION         旧题 review
SCHEDULED_REVIEW            复习触发
METHOD_TRANSFER             方法迁移
KNOWLEDGE_DIAGNOSIS         知识点诊断
STATE_UPDATE_ONLY           只更新状态
CLARIFY_INTENT              意图不明确
```

主 Agent 的输出不只是答案，而是一个教学动作：

```text
answer_result
question_result
review_result
state_delta
next_action
frontend_render_plan
```

也就是说，它每次回答都要思考：

```text
这次是解题？
还是复习？
还是诊断？
还是生成练习？
还是把旧知识和新方法连起来？
```

---

# 四、意图理解子 Agent

意图理解子 Agent 的职责必须很窄：

```text
把用户输入转成可执行查询计划。
```

它不负责解题，不负责讲解，不负责写数据库。它只输出结构化计划。

例如用户说：

```text
我想复习一下之前错过的极限题，再出一道类似但换方法的。
```

子 Agent 应输出：

```json
{
  "intent": "REVIEW_AND_VARIANT",
  "task_type": ["REVIEW_OLD_QUESTION", "GENERATE_SIMILAR_QUESTION", "METHOD_TRANSFER"],
  "needs_sqlite": {
    "query_user_wrong_questions": true,
    "filters": {
      "knowledge_area": "极限",
      "recent_only": false,
      "mastery_level": ["weak", "reviewing"]
    }
  },
  "needs_pgsql": {
    "retrieval_targets": [
      "old_question_detail",
      "same_knowledge_different_method",
      "same_method_different_knowledge"
    ],
    "difficulty_policy": "near_user_level",
    "exclude_recently_done": true
  },
  "expected_output": {
    "include_old_review": true,
    "include_new_question": true,
    "include_method_comparison": true,
    "include_state_update": true
  }
}
```

这一步最重要。因为后面所有工具调用都依赖这个 plan。

---

# 五、Workflow 设计

在扣子里，不建议把所有东西放进一个巨大 Bot Prompt。应该把主要流程做成 Workflow。扣子支持通过 API 运行应用工作流，流式响应接口也适合接到 Iris 前端做打字机式输出。([扣子](https://www.coze.cn/open/docs/guides/run_app_as_api?utm_source=chatgpt.com "通过API 运行应用工作流- 文档"))

你至少需要 5 条 Workflow。

---

## 1. 新题解答 Workflow

```text
用户输入题目
  ↓
主 Agent 判断：NEW_QUESTION_SOLVE
  ↓
Question Analyzer Agent 分析题目
  ↓
PgSQL 查相似题 / 知识点 / 方法资产
  ↓
主 Agent 生成解答
  ↓
生成同类题或变式题
  ↓
Context Compressor 压缩本轮学习信息
  ↓
State Delta Generator 生成状态变化建议
  ↓
Pending State Writer 写入 pending_state_delta
  ↓
Rule Validator 校验通过后更新 SQLite 正式状态
  ↓
返回 Iris 渲染
```

输出结构：

```json
{
  "answer_result": {
    "final_answer": "",
    "solution_steps": [],
    "key_methods": [],
    "common_mistakes": []
  },
  "question_result": {
    "similar_question": "",
    "variant_type": "same_knowledge",
    "difficulty": 3
  },
  "state_delta": {
    "knowledge_points_touched": [],
    "methods_touched": [],
    "estimated_mastery_change": []
  },
  "frontend_render_plan": {
    "cards": ["solution", "method_summary", "similar_question", "state_change"]
  }
}
```

---

## 2. 复习 Workflow

```text
用户请求复习 / 系统触发复习
  ↓
SQLite 查薄弱知识点、错题、上次复习时间
  ↓
Review Strategy Agent 决定复习策略
  ↓
PgSQL 召回候选题
  ↓
主 Agent 组织复习包
  ↓
用户作答
  ↓
判题 + 解析
  ↓
Pending State Writer 写入状态变化建议
  ↓
Rule Validator 校验通过后更新 SQLite 回写复习结果
```

复习包不是一道题，而应该是：

```text
旧题 review
同知识点新题
方法迁移题
错因对照
下次复习建议
```

---

## 3. 旧题 Review Workflow

```text
SQLite 查用户历史错题
  ↓
PgSQL 查原题、解析、步骤、方法标签
  ↓
主 Agent 生成旧题 review
  ↓
对照用户当时错因
  ↓
输出“当时为什么错 / 现在应该怎么识别”
```

这个流程的核心不是再讲一遍原题，而是回答：

```text
你当时错在哪里？
这个错误属于知识点错、方法错、计算错、审题错还是结构识别错？
下次遇到什么信号应该想到这个方法？
```

---

## 4. 方法迁移 Workflow

```text
SQLite 查用户已掌握方法
  ↓
PgSQL 查同方法不同知识点题
  ↓
主 Agent 构造迁移解释
  ↓
输出新题
  ↓
对比旧题方法结构
```

例如：

```text
旧题：数列极限，用夹逼
新题：函数极限，也用夹逼
对比：对象变了，但“构造上下界”的方法不变
```

这部分会成为你系统区别于普通刷题软件的关键。

---

## 5. 上下文压缩 Workflow

这个 Workflow 每轮都可以调用，但不一定每轮都写库。

```text
本轮对话
  ↓
已有 session_summary
  ↓
本轮题目 / 答案 / 用户表现 / 工具结果
  ↓
Context Compressor Agent
  ↓
生成新的压缩上下文
  ↓
写入扣子变量或 SQLite
```

输出应该是结构化摘要，不是自然语言流水账。

```json
{
  "session_summary": "用户本轮学习了数列极限中的夹逼法，能理解基本上下界，但对如何主动构造上下界不稳定。",
  "stable_facts": {
    "current_subject": "高等数学",
    "current_topic": "极限",
    "active_methods": ["夹逼估计"]
  },
  "learning_state_delta": {
    "knowledge_point": "数列极限",
    "method": "夹逼估计",
    "mastery_signal": "partial",
    "error_risk": ["不会主动构造上下界"]
  },
  "open_loops": [
    "需要再做一道同方法但题面变化较大的题"
  ],
  "references": {
    "question_ids": [],
    "attempt_ids": []
  }
}
```

---

# 六、上下文压缩设计

这是 Agent 系统能不能长期运行的关键。

你要区分四类上下文：

```text
1. 原始上下文
2. 工作上下文
3. 压缩上下文
4. 可回溯引用
```

---

## 1. 原始上下文

原始上下文包括：

```text
用户原始输入
完整题目
完整回答
完整工具结果
完整状态回写
```

这些不应该长期塞进 Prompt。它们应该进入日志或状态库。

---

## 2. 工作上下文

工作上下文是当前这一轮必须用到的信息：

```text
当前用户问题
最近 3 到 5 轮对话
当前题目
当前查询计划
当前工具结果
当前输出要求
```

它进入主 Agent Prompt。

---

## 3. 压缩上下文

压缩上下文是对长期对话的摘要：

```text
用户当前学科
当前章节
最近薄弱点
已掌握方法
未闭合任务
最近错因
正在进行的复习目标
```

它可以放在扣子变量里。扣子的变量能力适合存储动态变化信息，用来让 Agent 根据不同情况调整行为。([Coze](https://www.coze.com/open/docs/guides/variable?utm_source=chatgpt.com "Variable - Document"))

---

## 4. 可回溯引用

所有关键对象都不要只写摘要，要保留 ID：

```text
question_id
attempt_id
knowledge_point_id
method_id
review_session_id
workflow_run_id
```

原因很简单：

```text
摘要会损失信息
ID 可以回查原文
```

所以压缩上下文应该遵守一个原则：

```text
自然语言摘要负责“让 Agent 快速理解”
ID 引用负责“让系统准确回查”
```

---

# 七、上下文压缩触发规则

不要等上下文爆了再压缩。应该固定触发。

建议规则：

```text
1. 每完成一道题后压缩一次
2. 每完成一次复习后压缩一次
3. 当前对话超过 N 轮后压缩一次
4. 工具返回内容过长时先压缩再进主 Agent
5. 用户切换章节 / 学科时压缩一次
6. 写入 SQLite 前压缩一次
```

你可以设置三层摘要：

```text
turn_summary      本轮摘要
session_summary   本次会话摘要
profile_summary   长期学习画像摘要
```

其中：

```text
turn_summary      放扣子变量
session_summary   放 SQLite
profile_summary   放 SQLite，必要时同步到长期用户画像
```

---

# 八、Prompt 拼接结构

不要写一个巨大 Prompt。要拼接成模块。

主 Agent 最终看到的 Prompt 应该由 7 层组成：

```text
1. System Role
2. Task Policy
3. User Learning Snapshot
4. Current User Input
5. Retrieval Results
6. Tool Execution Constraints
7. Output Schema
```

也就是：

```text
[系统角色]
你是数学学习系统的主控 Agent，负责解题、复习、题目召回、状态更新建议。

[任务策略]
当前任务类型：REVIEW_AND_VARIANT
你需要输出旧题 review、同知识点新题、方法迁移解释。

[用户状态摘要]
用户当前薄弱知识点：数列极限
当前薄弱方法：夹逼估计
最近错因：不会主动构造上下界

[当前输入]
用户说：我想复习一下之前错过的极限题，再出一道类似但换方法的。

[工具结果]
SQLite 返回：历史错题 question_id = ...
PgSQL 返回：候选题列表 ...

[工具约束]
不得编造数据库中不存在的 question_id。
不得把未审核题作为正式复习题。
如果召回结果不足，输出降级策略。

[输出格式]
输出 answer_result / review_result / state_delta / frontend_render_plan。
```

这套结构比“一个长人设 Prompt”稳定得多。

---

# 九、Prompt 分层管理

建议你在扣子里维护 6 类 Prompt。

```text
P0_GLOBAL_POLICY
P1_MAIN_AGENT_ROUTER
P2_INTENT_PLANNER
P3_QUESTION_ANALYZER
P4_REVIEW_STRATEGIST
P5_CONTEXT_COMPRESSOR
P6_OUTPUT_FORMATTER
```

---

## P0_GLOBAL_POLICY

所有 Agent 共用，约束系统边界。

核心内容：

```text
你是学习系统中的 Agent。
不得直接编造数据库结果。
不得输出未被工具返回的题目 ID。
不得把用户学习状态和题目资产混为一谈。
PgSQL 是题目资产库。
SQLite 是用户状态库。
所有数据库操作必须通过工具完成。
```

---

## P1_MAIN_AGENT_ROUTER

主 Agent 使用。

核心内容：

```text
你负责判断当前任务类型，并选择合适的 Workflow。
你不直接写 SQL。
你不直接修改状态。
你只生成工具调用意图和最终教学输出。
```

---

## P2_INTENT_PLANNER

意图理解子 Agent 使用。

核心内容：

```text
你只负责把用户输入转成查询计划。
不要解题。
不要讲解。
不要写状态。
输出必须是 JSON。
```

---

## P3_QUESTION_ANALYZER

题目分析子 Agent 使用。

核心内容：

```text
你负责分析题目的知识点、方法、题型、难度、结构特征。
如果题目信息不足，标记 uncertain。
不要过度标注。
```

---

## P4_REVIEW_STRATEGIST

复习策略子 Agent 使用。

核心内容：

```text
你根据用户历史状态决定复习策略。
优先处理高频错因、低掌握度知识点、到期复习项。
输出复习组合，而不是单题。
```

---

## P5_CONTEXT_COMPRESSOR

上下文压缩子 Agent 使用。

核心内容：

```text
你负责把对话压缩成学习状态摘要。
保留 question_id、knowledge_point_id、method_id。
不要保留冗余推理过程。
不要把模型猜测写成事实。
```

---

## P6_OUTPUT_FORMATTER

输出格式 Agent 或节点使用。

核心内容：

```text
你负责把主 Agent 结果整理为前端可渲染结构。
输出包括卡片类型、展示顺序、折叠区域、重点提示。
```

---

# 十、工具调用设计

扣子里通过插件节点调用外部工具比较合适，因为插件节点就是在工作流中调用插件运行指定工具，而插件是一组可调用 API。([Coze](https://www.coze.com/open/docs/guides/plugin_node?utm_source=chatgpt.com "Plugin node - Document"))

你的工具不要设计成“万能 SQL 工具”。应该设计成有限 API。

至少需要这些工具：

```text
state.query_user_snapshot
state.query_wrong_questions
state.query_review_due_items
state.write_attempt_result
state.write_review_result
asset.get_question_detail
asset.search_by_knowledge
asset.search_by_method
asset.search_same_knowledge_different_method
asset.search_same_method_different_knowledge
asset.search_similar_questions
asset.create_draft_question
asset.get_solution_steps
log.write_agent_event
```

不要暴露：

```text
execute_sql(sql)
```

这很危险，也不可控。

---

# 十一、工具 API 的推荐形态

例如 `asset.search_same_knowledge_different_method`：

```json
{
  "base_question_id": "uuid",
  "difficulty_policy": "near",
  "exclude_method_ids": ["uuid"],
  "limit": 3,
  "only_active": true
}
```

返回：

```json
{
  "items": [
    {
      "question_id": "uuid",
      "stem": "...",
      "knowledge_points": ["函数极限"],
      "methods": ["泰勒展开"],
      "difficulty_level": 3,
      "reason": "同属极限问题，但主方法由夹逼改为泰勒展开。"
    }
  ]
}
```

工具返回一定要带 `reason`，因为主 Agent 需要知道为什么召回它。

---

# 十二、工具调用的执行顺序

用户请求进入后，不要立刻查库。标准顺序应该是：

```text
1. Main Agent 判断大类
2. Intent Planner 输出查询计划
3. Query Validator 校验查询计划
4. Tool Dispatcher 调用工具
5. Tool Result Compressor 压缩工具结果
6. Main Agent 组织最终答案
7. State Delta Generator 生成状态变化
8. State Writer 写回 SQLite
9. Output Formatter 返回前端
```

特别注意第 3 步。  
子 Agent 输出的查询计划不能直接执行，必须校验：

```text
intent 是否合法
retrieval_type 是否合法
limit 是否过大
是否试图访问用户无关数据
是否要求未开放工具
```

---

# 十三、查询计划不要等于 SQL

子 Agent 输出的是：

```json
{
  "retrieval_type": "same_knowledge_different_method",
  "base_question_id": "uuid",
  "limit": 3
}
```

API 层再把它转成 SQL。

不要让 Agent 输出：

```sql
select * from question_asset ...
```

原因：

```text
1. 容易注入
2. 难以权限控制
3. 难以审计
4. 难以调试
5. 容易产生不存在的字段
```

---

# 十四、状态回写不能由主 Agent 直接决定

主 Agent 可以提出 `state_delta`，但真正写回前应该由规则层校验。

例如主 Agent 输出：

```json
{
  "state_delta": {
    "knowledge_point": "数列极限",
    "mastery_change": "+0.15",
    "evidence": "用户独立完成夹逼法题目"
  }
}
```

API 层应该校验：

```text
本轮是否真的有用户作答
是否有判题结果
是否有题目 ID
是否有知识点 ID
mastery_change 是否在合法范围
```

也就是说：

```text
Agent 负责建议
规则层负责落库
```

这是防止“模型幻觉污染状态库”的关键。

如果你在 MVP 阶段暂时不想实现完整的 `pending_state_delta` 工作流，也至少要满足一个更强的约束：

```text
只有规则可直接推导出的状态变化可以落库
主 Agent 自由生成的状态判断不得直接写正式状态表
```

例如：

```text
用户答错 + 已有题目标签 + 已有判题结果
  → 可以由规则层直接降低 mastery_score

主 Agent 说“用户大概已经掌握”
  → 不能直接落库
```

---

# 十五、上下文压缩与状态写回的区别

这两个不要混。

```text
上下文压缩：为了让 Agent 下一轮更好理解对话
状态写回：为了让系统长期记录用户学习状态
```

上下文压缩可以写：

```text
用户似乎对夹逼法还不稳定
```

状态写回必须写：

```text
attempt_id = xxx
question_id = xxx
is_correct = false
error_type = method_selection_error
knowledge_point_id = xxx
method_id = xxx
```

也就是说：

```text
上下文摘要可以是软判断
数据库状态必须是结构化证据
```

---

# 十六、扣子变量应该存什么

扣子变量适合存短期动态信息，不适合存完整数据库。

建议存：

```json
{
  "current_subject": "高等数学",
  "current_topic": "极限",
  "current_mode": "review",
  "session_summary": "...",
  "active_question_id": "uuid",
  "active_workflow": "REVIEW_AND_VARIANT",
  "recent_tool_result_summary": "...",
  "pending_state_delta": {}
}
```

不要存：

```text
完整题库
完整历史错题
完整解析
完整用户状态表
```

这些都应该通过工具查。

---

# 十七、扣子知识库应该怎么用

扣子知识库不要作为你的主题库。官方文档描述知识库支持上传和存储外部知识内容，并提供检索能力；这适合放规则文档、教学规范、提示词说明、学科讲义，但不适合代替 PgSQL 的结构化题库。([扣子](https://www.coze.cn/open/docs/guides/agent_knowledge?utm_source=chatgpt.com "为低代码智能体添加知识- 文档"))

建议扣子知识库存：

```text
教学风格规范
错因分类标准
题目分析标准
知识点标注说明
方法标签说明
前端展示规范
系统使用说明
课程大纲说明
```

PgSQL 存：

```text
题目
答案
解析
知识点
方法
结构
相似关系
```

这样分工更清楚。

---

# 十八、核心 Agent 状态机

你的主 Agent 应该维护一个显式状态机。

```text
IDLE
  ↓
INTENT_DETECTED
  ↓
PLAN_CREATED
  ↓
TOOLS_CALLED
  ↓
RESULTS_COMPRESSED
  ↓
TEACHING_OUTPUT_READY
  ↓
STATE_DELTA_READY
  ↓
STATE_WRITTEN
  ↓
DONE
```

异常状态：

```text
NEED_CLARIFICATION
NO_RETRIEVAL_RESULT
TOOL_ERROR
LOW_CONFIDENCE_ANALYSIS
STATE_WRITE_REJECTED
```

这样做的好处是后面调试时能知道：

```text
是意图错了？
是召回错了？
是工具错了？
是上下文压缩错了？
是状态回写错了？
还是最终生成错了？
```

---

# 十九、错误处理策略

Agent 系统必须设计降级策略。

## 1. SQLite 查不到用户状态

降级为：

```text
按当前题目知识点做普通讲解
不做个性化复习
提示“暂无足够历史状态”
```

## 2. PgSQL 查不到同类题

降级为：

```text
由主 Agent 生成一道临时题
写入 PgSQL draft
不进入 active 题库
```

## 3. 方法标签不确定

降级为：

```text
只按知识点召回
不做方法迁移
标记 method_confidence = low
```

## 4. 上下文过长

降级为：

```text
先压缩工具结果
只保留 top-k 题目
完整结果只保留 ID
```

## 5. 状态写回失败

降级为：

```text
正常给用户答案
记录 pending_state_delta
稍后重试或提示状态未保存
```

---

# 二十、一次完整调用示例

用户输入：

```text
我想复习一下之前错过的极限题，再出一道类似但换方法的。
```

系统流程：

```text
1. Iris 发送 user_input
2. 扣子主 Agent 判断：复习 + 变式 + 方法迁移
3. Intent Planner 输出查询计划
4. 调 state.query_wrong_questions
5. 查到用户错过 question_id = Q1
6. 调 asset.get_question_detail(Q1)
7. 调 asset.search_same_knowledge_different_method(Q1)
8. 调 asset.search_same_method_different_knowledge(Q1)
9. 工具结果压缩
10. Review Strategy Agent 选择复习组合
11. 主 Agent 输出旧题 review + 新题 + 方法对比
12. Context Compressor 生成 session_summary
13. 用户作答后再写入 SQLite
```

最终输出给 Iris：

```json
{
  "mode": "review_and_variant",
  "cards": [
    {
      "type": "old_question_review",
      "title": "旧题回顾",
      "question_id": "Q1"
    },
    {
      "type": "method_diagnosis",
      "title": "当时的主要问题",
      "content": "你不是不会极限，而是不稳定地识别夹逼结构。"
    },
    {
      "type": "new_question",
      "title": "同知识点换方法题",
      "question_id": "Q2"
    },
    {
      "type": "method_comparison",
      "title": "方法对比",
      "content": "旧题用夹逼，新题用泰勒展开；知识点同属极限，但解题入口不同。"
    }
  ],
  "pending_state_write": true
}
```

---

# 二十一、前端 Iris 与扣子的接口

Iris 不应该直接碰数据库。Iris 只负责：

```text
输入题目
展示答案
展示卡片
展示同类题
展示复习进度
提交用户作答
展示状态变化
```

Iris 调扣子：

```text
POST /agent/chat
POST /agent/workflow/run
```

扣子再调你的 API：

```text
POST /state/query
POST /asset/retrieve
POST /state/write
POST /log/write
```

这里要补一个分层说明，不然后面很容易把“HTTP 接口”和“工具接口”混成一层。

这四个 `POST` 更适合作为：

```text
API Gateway / BFF / Tool Gateway 的粗粒度入口
```

而真正给 Agent 暴露的业务工具，仍然应该是前面列的细粒度工具，例如：

```text
state.query_wrong_questions
state.query_review_due_items
asset.search_same_knowledge_different_method
asset.get_question_detail
state.write_attempt_result
```

也就是说分层应该是：

```text
Iris
  ↓ HTTP
扣子
  ↓ 工具调用
Tool Gateway
  ↓ 内部路由
state.* / asset.* / log.*
```

这样才能同时满足：

```text
前端接口干净
Agent 工具粒度清晰
后端实现可以替换
```

前端只接收渲染结构：

```json
{
  "render_type": "learning_response",
  "cards": [],
  "actions": [
    {
      "type": "submit_answer",
      "label": "提交答案"
    },
    {
      "type": "request_hint",
      "label": "要提示"
    },
    {
      "type": "generate_variant",
      "label": "再来一道变式"
    }
  ]
}
```

这样 Iris 前端会很干净。

---

# 二十二、日志与可观测性

Agent 系统一定要记录日志。否则你后面不知道错在哪里。

每次运行记录：

```text
workflow_run_id
user_id
input_text
detected_intent
query_plan
tool_calls
tool_results_summary
final_output_summary
state_delta
state_write_status
error_message
latency
token_usage
```

其中最关键的是：

```text
detected_intent
query_plan
tool_calls
state_delta
```

因为你的系统核心不是“模型有没有答出来”，而是：

```text
它为什么查这些题？
为什么判断用户薄弱？
为什么推荐这个复习题？
为什么改变状态？
```
