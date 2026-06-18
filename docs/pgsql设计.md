
# 一、PgSQL 的边界

PgSQL 存这些：

```text
题目原文
标准答案
解析
解题步骤
知识点
方法
题型
难度
来源
题目结构特征
题目之间的相似关系
题目变式关系
题目质量状态
向量索引 / embedding
```

PgSQL 不存这些：

```text
某个用户做没做过
某个用户答对没答对
某个用户当前掌握度
某个用户下次复习时间
某个用户错因历史
某个用户学习轨迹
```

这些属于 SQLite 用户状态层。

你后面从 SQLite 查到：

```text
用户最近错过 question_id = xxx
```

然后再拿这个 `question_id` 去 PgSQL 查：

```text
原题
解析
同知识点题
同方法题
方法迁移题
结构相似题
旧题 review 所需资产
```

也就是说：

```text
SQLite 负责“这个学生需要什么”
PgSQL 负责“系统里有哪些题目资产可用”
```


# 二、PgSQL 的核心实体

整体数据模型可以理解为：

```text
source
  ↓
question
  ↓
answer / solution / solution_step
  ↓
knowledge_point
  ↓
method
  ↓
question_structure
  ↓
embedding
  ↓
similarity_edge
```

其中最重要的是四条线：

```text
题目线：question
答案线：answer / solution / step
知识线：knowledge_point
方法线：method
相似线：similarity_edge
```

不要把它们全部塞进一个 JSON。否则后面想查“同知识点但不同方法”“同方法但不同知识点”“结构相似但难度更高”时，会非常痛苦。


# 三、推荐表结构总览

建议先分成 12 张核心表。

```text
1. subject_domain              学科 / 课程 / 章节体系
2. source_asset                来源资产
3. question_asset              题目主表
4. question_version            题目版本表
5. answer_asset                标准答案表
6. solution_asset              解析主表
7. solution_step               解题步骤表
8. knowledge_point             知识点表
9. method_asset                方法表
10. question_knowledge_point   题目-知识点关联表
11. question_method            题目-方法关联表
12. question_similarity_edge   题目相似关系表
```

进阶再加：

```text
13. question_structure_feature  题目结构特征表
14. question_embedding          题目向量表
15. question_variant_edge       题目变式关系表
16. asset_review_log            题目质量审核表
17. import_batch                导入批次表
18. staging_question_raw        原始导入暂存表
```

---

# 四、基础建库设计

建议使用 UUID 做主键。因为后面题目资产可能来自多个来源：手工录入、PDF 清洗、AI 生成、公开题库、用户新题沉淀。如果用自增 ID，后面合并库会麻烦。

```sql
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
```

如果你后面要在 PgSQL 内做向量召回，可以再加：

```sql
create extension if not exists vector;
```

不过早期可以先不强依赖 pgvector，先把 embedding 字段预留出来。



# 五、学科与章节体系表

这个表负责表达：

```text
数学
  └── 高等数学
        └── 极限
              └── 数列极限
              └── 函数极限
```

表结构：

```sql
create table subject_domain (
    id uuid primary key default gen_random_uuid(),

    parent_id uuid references subject_domain(id) on delete set null,

    name text not null,
    code text unique,

    level int not null default 0,

    description text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

例子：

```text
数学
高等数学
极限
数列极限
函数极限
连续性
导数
积分
线性代数
概率论
```

这个表的作用是给知识点、题目来源、章节召回提供层级结构。



# 六、来源资产表

题目必须有来源。即使是 AI 生成，也要标记来源为 `generated`。否则后面无法控制质量和版权边界。

```sql
create table source_asset (
    id uuid primary key default gen_random_uuid(),

    source_type text not null,
    -- textbook / exam / pdf / markdown / ai_generated / user_submitted / manual

    title text,
    author text,
    publisher text,
    year int,

    file_uri text,
    page_start int,
    page_end int,

    external_url text,

    license_note text,

    raw_metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now()
);
```

这里可以存：

```text
教材名
试卷名
PDF 文件路径
页码
章节
来源 URL
是否 AI 生成
是否人工校对
```



# 七、题目主表 question_asset

这是 PgSQL 的核心表。

```sql
create table question_asset (
    id uuid primary key default gen_random_uuid(),

    source_id uuid references source_asset(id) on delete set null,
    subject_id uuid references subject_domain(id) on delete set null,

    title text,
    stem text not null,

    question_type text not null,
    -- single_choice / multiple_choice / fill_blank / calculation / proof / programming / essay

    difficulty_level int not null default 3,
    -- 1 极易，2 简单，3 中等，4 较难，5 很难

    difficulty_note text,

    language text not null default 'zh',

    status text not null default 'draft',
    -- draft / imported / reviewed / active / deprecated / rejected

    origin_type text not null default 'unknown',
    -- human_curated / ai_generated / imported / user_submitted

    is_public boolean not null default true,

    canonical_hash text,
    -- 用于去重，stem 归一化后 hash

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

关键字段解释：

```text
stem              题目正文
question_type     题型
difficulty_level  难度
status            题目资产状态
origin_type       来源类型
canonical_hash    去重用
metadata          不稳定扩展字段
```

`metadata` 可以放一些暂时没标准化的东西，但不要滥用。

例如：

```json
{
  "exam_region": "广东",
  "estimated_time_minutes": 8,
  "latex_detected": true,
  "has_image": false
}
```



# 八、题目版本表 question_version

题目后面会被清洗、修正、重新 LaTeX 化、拆解。不要直接覆盖原题。应该保留版本。

```sql
create table question_version (
    id uuid primary key default gen_random_uuid(),

    question_id uuid not null references question_asset(id) on delete cascade,

    version_no int not null,

    stem text not null,

    change_note text,

    created_by text,
    created_at timestamptz not null default now(),

    unique(question_id, version_no)
);
```

用途：

```text
保留原始 OCR 版本
保留清洗后版本
保留人工修订版本
保留标准 LaTeX 版本
```

这样做的好处是后面可以回溯：

```text
这道题为什么召回错了？
是不是 OCR 误识别？
是不是 AI 清洗改错了？
```


# 九、答案表 answer_asset

答案和解析分开。答案是最终结果，解析是推导过程。

```sql
create table answer_asset (
    id uuid primary key default gen_random_uuid(),

    question_id uuid not null references question_asset(id) on delete cascade,

    answer_text text not null,

    answer_type text not null default 'standard',
    -- standard / short / option / numeric / symbolic

    is_primary boolean not null default true,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now()
);
```

例子：

```text
选择题：B
计算题：lim = 1/2
证明题：命题成立
编程题：参考输出
```



# 十、解析表 solution_asset

一题可以有多种解法。

例如一道极限题可以有：

```text
解法一：夹逼定理
解法二：洛必达法则
解法三：泰勒展开
```

所以解析不能和题目一对一绑定。

```sql
create table solution_asset (
    id uuid primary key default gen_random_uuid(),

    question_id uuid not null references question_asset(id) on delete cascade,

    title text,

    solution_text text not null,

    solution_type text not null default 'standard',
    -- standard / alternative / concise / detailed / teaching / review

    main_method_id uuid,

    difficulty_level int,

    is_primary boolean not null default false,

    quality_score numeric(4,2),
    -- 0 到 10

    status text not null default 'draft',
    -- draft / reviewed / active / deprecated

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now()
);
```

这里的 `main_method_id` 后面会指向 `method_asset`。



# 十一、解题步骤表 solution_step

这个表很重要。因为你的系统后面要做：

```text
旧题 review
错因定位
方法迁移
同类题生成
解题路径相似
```

这些都不能只靠整段解析文本完成。

```sql
create table solution_step (
    id uuid primary key default gen_random_uuid(),

    solution_id uuid not null references solution_asset(id) on delete cascade,

    step_order int not null,

    step_title text,
    step_text text not null,

    step_role text,
    -- understand_problem / transform / apply_method / compute / conclude / check

    knowledge_point_id uuid,
    method_id uuid,

    formula_text text,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),

    unique(solution_id, step_order)
);
```

例子：

```text
step 1：识别这是数列极限问题
step 2：将原式变形为可夹逼形式
step 3：构造上下界
step 4：使用夹逼定理
step 5：得到极限
```

这张表是后面做“教学型 Agent”的基础。没有 step 级结构，系统只能泛泛讲题。



# 十二、知识点表 knowledge_point

知识点应该是一个可演化的层级图，不只是普通 tag。

```sql
create table knowledge_point (
    id uuid primary key default gen_random_uuid(),

    subject_id uuid references subject_domain(id) on delete set null,
    parent_id uuid references knowledge_point(id) on delete set null,

    name text not null,
    code text unique,

    description text,

    level int not null default 0,

    prerequisite_ids uuid[] not null default '{}',
    -- 先简单用数组，后面可以拆成 knowledge_prerequisite_edge 表

    status text not null default 'active',

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

例子：

```text
极限
数列极限
函数极限
无穷小比较
夹逼定理
单调有界准则
泰勒展开
洛必达法则
导数定义
定积分定义
矩阵秩
特征值
条件概率
中心极限定理
```

注意：有些东西既像知识点又像方法，比如“夹逼定理”。我的建议是：

```text
作为知识内容时，放 knowledge_point
作为解题策略时，放 method_asset
```

比如：

```text
knowledge_point: 夹逼定理的定义与条件
method_asset: 使用夹逼定理处理极限
```



# 十三、方法表 method_asset

方法不是知识点。方法是“怎么做题”的策略。

```sql
create table method_asset (
    id uuid primary key default gen_random_uuid(),

    parent_id uuid references method_asset(id) on delete set null,

    name text not null,
    code text unique,

    description text,

    method_type text,
    -- transform / theorem_application / construction / estimation / contradiction / induction / computation

    applicable_scene text,

    status text not null default 'active',

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
```

例子：

```text
换元法
构造辅助函数
夹逼估计
泰勒展开
洛必达法则
数学归纳法
反证法
分类讨论
特征方程法
矩阵初等变换
配方法
变量替换
构造反例
```

这是你系统里最有价值的一层。

普通题库只会说：

```text
这题考极限
```

你的系统应该能说：

```text
这题考极限，但真正的方法缺口是“构造夹逼上下界”
```



# 十四、题目—知识点关联表

一题可能有多个知识点。要区分主知识点和辅助知识点。

```sql
create table question_knowledge_point (
    question_id uuid not null references question_asset(id) on delete cascade,
    knowledge_point_id uuid not null references knowledge_point(id) on delete cascade,

    role text not null default 'secondary',
    -- primary / secondary / prerequisite / hidden

    weight numeric(5,4) not null default 1.0,

    confidence numeric(5,4) not null default 1.0,
    -- AI 标注可以低一些，人工审核后设为 1

    created_at timestamptz not null default now(),

    primary key (question_id, knowledge_point_id, role)
);
```

例子：

```text
主知识点：函数极限
辅助知识点：等价无穷小
前置知识点：基本初等函数极限
隐藏知识点：泰勒展开
```



# 十五、题目—方法关联表

同理，一题可能有多个方法。

```sql
create table question_method (
    question_id uuid not null references question_asset(id) on delete cascade,
    method_id uuid not null references method_asset(id) on delete cascade,

    role text not null default 'secondary',
    -- primary / secondary / alternative / hidden

    weight numeric(5,4) not null default 1.0,

    confidence numeric(5,4) not null default 1.0,

    created_at timestamptz not null default now(),

    primary key (question_id, method_id, role)
);
```

例子：

```text
主方法：夹逼估计
辅助方法：放缩
可替代方法：泰勒展开
隐藏方法：构造上下界
```

这张表直接服务于：

```text
同方法迁移
不同方法变式
错因定位
方法熟练度统计
```



# 十六、题目结构特征表

题目结构特征不是自然语言标签，而是更接近“题目骨架”。

例如：

```text
求极限：lim_{n→∞} a_n
证明：存在唯一解
计算：矩阵秩
判断：级数收敛性
构造：反例
```

表结构：

```sql
create table question_structure_feature (
    id uuid primary key default gen_random_uuid(),

    question_id uuid not null references question_asset(id) on delete cascade,

    structure_code text not null,
    -- limit.sequence.squeeze
    -- linear_algebra.matrix_rank.row_reduce
    -- probability.conditional.bayes
    -- proof.existence.uniqueness

    input_objects jsonb not null default '[]'::jsonb,
    -- 题目给了哪些对象，例如 sequence, function, matrix, random_variable

    target_objects jsonb not null default '[]'::jsonb,
    -- 要求什么，例如 limit_value, proof, rank, probability

    constraints jsonb not null default '{}'::jsonb,
    -- 条件结构

    symbolic_form text,
    -- 可选：抽象后的形式

    complexity_score numeric(5,2),

    created_at timestamptz not null default now()
);
```

例子：

```json
{
  "input_objects": ["sequence", "inequality"],
  "target_objects": ["limit"],
  "constraints": {
    "has_upper_bound": true,
    "has_lower_bound": true
  },
  "symbolic_form": "given lower(n) <= a_n <= upper(n), prove lim a_n = L"
}
```

这张表是“同类型题”的关键。  
因为“同类型”不是单纯同知识点，而是：

```text
知识点相近
方法相近
结构相近
目标相近
难度相近
```



# 十七、题目 embedding 表

embedding 不要直接塞在 `question_asset` 主表里。单独建表更灵活，因为以后你可能会换模型。

```sql
create table question_embedding (
    id uuid primary key default gen_random_uuid(),

    question_id uuid not null references question_asset(id) on delete cascade,

    embedding_model text not null,

    embedding_type text not null default 'stem',
    -- stem / solution / full / structure

    embedding vector(1536),

    created_at timestamptz not null default now(),

    unique(question_id, embedding_model, embedding_type)
);
```

如果你暂时不用 pgvector，可以改成：

```sql
embedding_json jsonb
```

或者：

```sql
embedding_float8 float8[]
```

但长远看，用 pgvector 更适合召回。

注意：embedding 只能解决“语义相似”，不能代替知识点、方法、结构。  
你的设计里应该让 embedding 只作为召回的一路信号，而不是唯一标准。



# 十八、题目相似关系表

这是系统的核心之一。

不要只存一个：

```text
similarity_score = 0.82
```

这没有教学意义。

应该拆成：

```text
知识点相似
方法相似
结构相似
解题路径相似
语义相似
难度相近
```

表结构：

```sql
create table question_similarity_edge (
    id uuid primary key default gen_random_uuid(),

    source_question_id uuid not null references question_asset(id) on delete cascade,
    target_question_id uuid not null references question_asset(id) on delete cascade,

    similarity_type text not null,
    -- knowledge / method / structure / solution_path / semantic / variant / prerequisite / contrast

    score numeric(6,5) not null,
    -- 0 到 1

    reason text,

    evidence jsonb not null default '{}'::jsonb,

    generated_by text not null default 'system',
    -- rule / embedding / llm / human

    status text not null default 'active',
    -- active / pending / rejected / deprecated

    created_at timestamptz not null default now(),

    check (source_question_id <> target_question_id)
);
```

例子：

```text
A 和 B 都考函数极限：knowledge similarity = 0.9
A 和 C 都用夹逼：method similarity = 0.85
A 和 D 都是“构造辅助函数”：solution_path similarity = 0.8
A 和 E 题面很像但方法不同：semantic similarity = 0.75, method similarity = 0.2
```

这正是你说的：

```text
不能把所有相似混成一个 embedding 分数
```

相似度应该是多通道的。



# 十九、题目变式关系表

相似题和变式题不一样。

相似题只是“像”。  
变式题是“从某题改造出来”。

```sql
create table question_variant_edge (
    id uuid primary key default gen_random_uuid(),

    base_question_id uuid not null references question_asset(id) on delete cascade,
    variant_question_id uuid not null references question_asset(id) on delete cascade,

    variant_type text not null,
    -- same_knowledge / changed_method / changed_condition / increased_difficulty / decreased_difficulty / transfer

    change_description text,

    generated_by text,
    -- human / llm / template

    quality_status text not null default 'pending',
    -- pending / reviewed / active / rejected

    created_at timestamptz not null default now(),

    check (base_question_id <> variant_question_id)
);
```

这个表支撑：

```text
同类题
变式题
难度递进题
换方法题
知识迁移题
```



# 二十、质量审核表

题目资产必须有质量状态。否则 AI 生成题会污染题库。

```sql
create table asset_review_log (
    id uuid primary key default gen_random_uuid(),

    asset_type text not null,
    -- question / solution / answer / knowledge_mapping / method_mapping / similarity_edge

    asset_id uuid not null,

    review_status text not null,
    -- pending / approved / rejected / needs_fix

    reviewer text,

    review_note text,

    score numeric(4,2),

    created_at timestamptz not null default now()
);
```

建议你把题目状态分清楚：

```text
draft       草稿
imported    已导入但未审核
reviewed    已审核
active      可被正式召回
deprecated  不推荐使用
rejected    错题 / 废题 / 质量差
```

召回时默认只查：

```sql
where status = 'active'
```

不要让未审核题进入正式复习流。



# 二十一、导入批次表与原始暂存表

你后面很可能从 PDF、Markdown、JSON 批量导入题目。不要一上来直接写入正式题库。应该先进入 staging。

```sql
create table import_batch (
    id uuid primary key default gen_random_uuid(),

    batch_name text not null,

    source_type text not null,
    -- pdf / markdown / json / manual / generated

    source_uri text,

    status text not null default 'pending',
    -- pending / processing / completed / failed

    total_count int default 0,
    success_count int default 0,
    failed_count int default 0,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now(),
    completed_at timestamptz
);
```

```sql
create table staging_question_raw (
    id uuid primary key default gen_random_uuid(),

    batch_id uuid references import_batch(id) on delete cascade,

    raw_text text not null,
    raw_json jsonb not null default '{}'::jsonb,

    parse_status text not null default 'pending',
    -- pending / parsed / failed / duplicate / rejected

    error_message text,

    canonical_hash text,

    created_question_id uuid references question_asset(id) on delete set null,

    created_at timestamptz not null default now()
);
```

导入流程应该是：

```text
原始 PDF / Markdown / JSON
  ↓
staging_question_raw
  ↓
清洗
  ↓
去重
  ↓
抽取题干、答案、解析、知识点、方法
  ↓
写入正式表
  ↓
生成 embedding
  ↓
生成相似边
  ↓
人工或半自动审核
  ↓
status = active
```



# 二十二、索引设计

基础索引：

```sql
create index idx_question_subject on question_asset(subject_id);
create index idx_question_type on question_asset(question_type);
create index idx_question_difficulty on question_asset(difficulty_level);
create index idx_question_status on question_asset(status);
create index idx_question_origin_type on question_asset(origin_type);
create index idx_question_hash on question_asset(canonical_hash);
```

题干全文检索：

```sql
create index idx_question_stem_trgm
on question_asset
using gin (stem gin_trgm_ops);
```

知识点召回：

```sql
create index idx_qkp_kp on question_knowledge_point(knowledge_point_id);
create index idx_qkp_question on question_knowledge_point(question_id);
```

方法召回：

```sql
create index idx_qm_method on question_method(method_id);
create index idx_qm_question on question_method(question_id);
```

相似边召回：

```sql
create index idx_similarity_source_type
on question_similarity_edge(source_question_id, similarity_type, score desc);

create index idx_similarity_target_type
on question_similarity_edge(target_question_id, similarity_type, score desc);
```

结构召回：

```sql
create index idx_structure_code
on question_structure_feature(structure_code);
```

如果启用 pgvector：

```sql
create index idx_question_embedding_vector
on question_embedding
using ivfflat (embedding vector_cosine_ops);
```



# 二十三、核心召回查询设计

## 1. 查同知识点题

```sql
select q.*
from question_asset q
join question_knowledge_point qkp
  on q.id = qkp.question_id
where qkp.knowledge_point_id = $1
  and q.status = 'active'
  and q.difficulty_level between $2 and $3
order by qkp.weight desc, q.created_at desc
limit $4;
```

用途：

```text
复习同知识点
巩固练习
新题推荐
```



## 2. 查同知识点但不同方法题

```sql
select distinct q.*
from question_asset q
join question_knowledge_point qkp
  on q.id = qkp.question_id
left join question_method qm
  on q.id = qm.question_id
where qkp.knowledge_point_id = $1
  and q.status = 'active'
  and (
      qm.method_id is null
      or qm.method_id <> all($2::uuid[])
  )
order by q.difficulty_level asc
limit $3;
```

用途：

```text
同知识点换方法
防止机械重复
拓展解法
```



## 3. 查同方法但不同知识点题

```sql
select distinct q.*
from question_asset q
join question_method qm
  on q.id = qm.question_id
left join question_knowledge_point qkp
  on q.id = qkp.question_id
where qm.method_id = $1
  and q.status = 'active'
  and (
      qkp.knowledge_point_id is null
      or qkp.knowledge_point_id <> all($2::uuid[])
  )
order by q.difficulty_level asc
limit $3;
```

用途：

```text
方法迁移
新旧知识点互通
比如：夹逼法从数列极限迁移到函数极限
```



## 4. 查结构相似题

```sql
select q.*
from question_asset q
join question_structure_feature sf
  on q.id = sf.question_id
where sf.structure_code = $1
  and q.status = 'active'
  and q.difficulty_level between $2 and $3
limit $4;
```

用途：

```text
同类型题
题目骨架相同
适合做变式练习
```



## 5. 查多通道相似题

```sql
select
    q.*,
    e.similarity_type,
    e.score,
    e.reason
from question_similarity_edge e
join question_asset q
  on q.id = e.target_question_id
where e.source_question_id = $1
  and e.similarity_type = any($2::text[])
  and e.score >= $3
  and q.status = 'active'
order by e.score desc
limit $4;
```

用途：

```text
旧题 review
相似题召回
薄弱点关联
跨知识点迁移
```



# 二十四、PgSQL 对 Agent 的输出格式

子 Agent 不应该直接拼 SQL。更稳妥的方式是让子 Agent 输出“查询计划”，然后由 API 层转成安全 SQL。

例如用户说：

```text
我想复习之前错过的极限题，再来一道类似但换方法的。
```

子 Agent 输出：

```json
{
  "intent": "review_and_variant",
  "retrieval_plan": {
    "from_sqlite": {
      "need": ["wrong_questions", "weak_knowledge_points", "recent_review_history"],
      "filters": {
        "knowledge_area": "极限"
      }
    },
    "from_pgsql": [
      {
        "retrieval_type": "same_knowledge_different_method",
        "knowledge_point": "极限",
        "exclude_methods_from_user_wrong_questions": true,
        "difficulty_policy": "slightly_harder"
      },
      {
        "retrieval_type": "old_question_review_assets",
        "include": ["stem", "answer", "solution_steps", "method_tags"]
      }
    ]
  }
}
```

API 层再执行：

```text
SQLite 查用户状态
PgSQL 查题目资产
主 Agent 组织生成
```

不要让 Agent 裸写 SQL。早期可以让它生成 SQL，但正式系统最好改成查询计划。

---

# 二十五、PgSQL 与 SQLite 的连接方式

SQLite 里保存用户状态时，不要复制整道题。只保存 PgSQL 的 `question_id`。

例如 SQLite 里有：

```text
user_question_attempt
- user_id
- question_id
- is_correct
- error_type
- created_at
```

然后 PgSQL 里通过 `question_id` 取题目资产。

```text
SQLite.question_id  →  PgSQL.question_asset.id
```

这样避免两边数据重复。

这里再补一个实现约束，避免后面跨库时主键格式漂移：

```text
PgSQL 中 question_id / knowledge_point_id / method_id 使用 UUID
SQLite 中对应字段使用 text 保存这些 UUID 的字符串表示
Agent 与 API 返回时统一使用字符串形式传输
```

不要出现：

```text
PgSQL 里是 uuid
SQLite 里改成自增整数
前端再自己维护另一套本地 id
```

否则后面相似题、复习记录、错题回查都会断链。

如果用户输入的是一道新题，流程应该是：

```text
用户输入新题
  ↓
主 Agent 解题
  ↓
抽取题目结构
  ↓
判断是否值得沉淀
  ↓
写入 PgSQL，status = draft 或 imported
  ↓
同时 SQLite 记录用户这次学习状态
```

注意：新题不要直接进入 `active`，否则未审核题会污染正式召回。

还要再补一个经常漏掉的业务边界：

```text
可用于当前会话的草稿题
≠
可被全局正式召回的 active 题
```

也就是说：

```text
用户当前 session 中为了教学需要生成的新题
可以写入 PgSQL draft，并带 session / workflow 来源
可以被当前会话继续引用
但默认不能参与其他用户、其他 session 的正式召回
```

只有在经过审核，或者至少通过明确的质量校验后，才允许进入：

```text
question_asset.status = active
```

否则会出现一个典型业务问题：

```text
为了当前用户临时生成的一道变式题
污染了整个题库的长期推荐结果
```

---

# 二十六、题目资产生命周期

每道题应该有生命周期：

```text
raw
  ↓
parsed
  ↓
normalized
  ↓
tagged
  ↓
reviewed
  ↓
active
  ↓
deprecated
```

对应到数据库可以是：

```text
staging_question_raw.parse_status
question_asset.status
solution_asset.status
asset_review_log.review_status
```

建议标准流程：

```text
1. 导入原始题目
2. 生成 canonical_hash 去重
3. 抽取题干、答案、解析
4. 标注知识点
5. 标注方法
6. 抽取结构特征
7. 生成 embedding
8. 生成相似边
9. 质量审核
10. active 后进入正式召回
```

如果这道题是“会话内临时题”，那它的生命周期建议单独看成：

```text
generated_in_session
  ↓
draft
  ↓
reviewed
  ↓
active 或 rejected
```

这样做的好处是能把：

```text
导入题
人工录入题
用户输入新题
AI 临时生成题
```

放进同一个资产生命周期体系里，但又不把它们的上线门槛混为一谈。
