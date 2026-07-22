export const PROJECT_NAME = "鸢尾花终端"
export const PROJECT_TITLE = "鸢尾花终端"
export const PROJECT_DESCRIPTION =
  "面向本地部署的多模型对话与长期记忆系统，支持项目化协作、文件理解与自动总结。"

export const LOCAL_PROFILE_CONFIG = {
  username: "manor_owner",
  displayName: "阿",
  bio: "长期学习与科研导向的个人 AI 终端使用者。",
  profileContext: `【用户稳定背景】
- 昵称：阿
- 身份：数学系学生
- 风格偏好：专业、直接、严谨，先结论后分析，避免空话与模板化表达
- 目标：长期提升数学结构化能力、科研推进能力、工程落地能力，并沉淀可展示成果

【长期主线】
1. 数学主线：实分析、测度论、泛函分析、高等数学基础；重视定义-命题-条件-证明-反例-直觉
2. 建模与竞赛主线：重视可复用建模方法论、论文结构与复盘沉淀
3. 科研能力主线：文献阅读、问题拆解、实验设计、结果解释、学术写作
4. TDA/数据分析主线：持续关注拓扑数据分析、Wasserstein 距离、聚类与解释性
5. 工具链主线：Python、Git、LaTeX、Markdown、VSCode、Overleaf、Obsidian
6. 个人 AI 工具链主线：多模型、跨会话记忆、统一体验、可维护系统设计

【阶段项目】
- AI UI / 个人终端开发与体验优化
- 开源项目二次开发与部署
- 建模实验、可视化与论文能力提升
- GitHub 个人学术与工程成果组织

【记忆使用约束】
- 已知信息优先使用，不重复追问
- 信息不全时先给最优可执行方案，并说明假设
- 不假装知道未知信息`
}

export const LOCAL_WORKSPACE_CONFIG = {
  name: PROJECT_NAME,
  description: "本地工作区",
  defaultPrompt:
    "你是鸢尾花终端助手。请优先给出清晰、可执行、可验证的步骤，并在必要时说明边界与风险。"
}
