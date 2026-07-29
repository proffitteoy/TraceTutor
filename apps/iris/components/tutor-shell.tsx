"use client"

import type {
  InputMode,
  LearningAction,
  LearningCard,
  LearningRequest,
  LearningResponse
} from "@/lib/contracts"
import { createGateway } from "@/lib/gateway"
import Image from "next/image"
import { FormEvent, useMemo, useRef, useState } from "react"

interface ConversationEntry {
  id: string
  role: "user" | "assistant"
  text: string
  response?: LearningResponse
}

type QuestionCard = Extract<
  LearningCard,
  { type: "new_question" | "old_question_review" }
>

function isQuestionCard(card: LearningCard): card is QuestionCard {
  return (
    card.type === "new_question" || card.type === "old_question_review"
  )
}

const MODE_LABELS: Record<InputMode, string> = {
  new_question: "新题解析",
  review: "复习调度",
  free_chat: "自由追问"
}

const QUICK_STARTS: Array<{
  mode: InputMode
  eyebrow: string
  title: string
  prompt: string
}> = [
  {
    mode: "new_question",
    eyebrow: "01 · 拆解",
    title: "分析一道新题",
    prompt: "帮我分析这道题，并指出最关键的解题入口。"
  },
  {
    mode: "review",
    eyebrow: "02 · 回看",
    title: "复习薄弱方法",
    prompt: "复习我最近不稳定的方法，再给一道换入口的题。"
  },
  {
    mode: "free_chat",
    eyebrow: "03 · 追问",
    title: "追问一个概念",
    prompt: "请从定义、直觉和反例三个角度解释这个概念。"
  }
]

function getBrowserIdentity(storage: Storage, key: string): string {
  const existing = storage.getItem(key)
  if (existing) return existing

  const created = crypto.randomUUID()
  storage.setItem(key, created)
  return created
}

const ICON_PATHS = {
  plus: "M12 5v14M5 12h14",
  history: "M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8m0-5v5h5M12 7v5l3 2",
  compass: "M12 22a10 10 0 100-20 10 10 0 000 20zm3.5-13.5l-2 5-5 2 2-5 5-2z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  spark: "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM19 16l.75 2.25L22 19l-2.25.75L19 22l-.75-2.25L16 19l2.25-.75L19 16z",
  database: "M4 6c0 1.66 3.58 3 8 3s8-1.34 8-3-3.58-3-8-3-8 1.34-8 3zm0 0v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6m-16 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zm-3-10l2 2 4-4"
}

function Icon({ name, size = 20 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

function CardView({ card }: { card: LearningCard }) {
  const status = card.type === "state_change" ? card.status : undefined

  return (
    <article className={`learning-card card-${card.type}`}>
      <header>
        <span className="card-kicker">{card.type.replaceAll("_", " · ")}</span>
        {status ? <span className={`state-pill state-${status}`}>{status}</span> : null}
      </header>
      <h3>{card.title}</h3>
      <p>{card.content}</p>

      {card.type === "solution" ? (
        <>
          <ol className="solution-steps">
            {card.steps.map(step => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="tag-row">
            {card.methods.map(method => (
              <span key={method}>{method}</span>
            ))}
          </div>
        </>
      ) : null}

      {"tags" in card && card.tags ? (
        <div className="tag-row">
          {card.tags.map(tag => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}

      {"question_id" in card ? (
        <footer className="question-meta">
          <code>{card.question_id}</code>
          {card.difficulty ? <span>难度 {card.difficulty}/5</span> : null}
        </footer>
      ) : null}
    </article>
  )
}

export function TutorShell() {
  const gateway = useMemo(() => createGateway(), [])
  const requestController = useRef<AbortController | null>(null)
  const [mode, setMode] = useState<InputMode>("new_question")
  const [input, setInput] = useState("")
  const [entries, setEntries] = useState<ConversationEntry[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<
    LearningRequest["action"] | null
  >(null)

  const latestResponse = [...entries]
    .reverse()
    .find(entry => entry.response)?.response
  const latestStateCards =
    latestResponse?.cards.filter(card => card.type === "state_change") ?? []
  const latestQuestionCards =
    latestResponse?.cards.filter(isQuestionCard) ?? []
  const gatewayEnabled = gateway !== null

  const resetSession = () => {
    sessionStorage.setItem(
      "tracetutor.session_id",
      crypto.randomUUID()
    )
    setEntries([])
    setActiveQuestionId(null)
    setPendingAction(null)
    setError(null)
  }

  const submit = async (text: string, requestedMode: InputMode = mode) => {
    const normalized = text.trim()
    if (!normalized || isSending) return

    if (!gateway) {
      setError(
        "教学网关尚未配置。请先设置 NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL。"
      )
      return
    }

    const identity = {
      userId: getBrowserIdentity(localStorage, "tracetutor.user_id"),
      sessionId: getBrowserIdentity(
        sessionStorage,
        "tracetutor.session_id"
      )
    }

    const userEntry: ConversationEntry = {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      text: normalized
    }

    setEntries(current => [...current, userEntry])
    setInput("")
    setError(null)
    setIsSending(true)

    const controller = new AbortController()
    requestController.current = controller

    const request: LearningRequest = {
      session_id: identity.sessionId,
      user_id: identity.userId,
      input_mode: requestedMode,
      user_text: normalized,
      attachments: [],
      active_question_id: activeQuestionId,
      ...(pendingAction ? { action: pendingAction } : {})
    }

    try {
      const response = await gateway.send(request, controller.signal)
      const nextQuestion = response.cards.find(
        card => card.type === "new_question"
      )
      if (nextQuestion && "question_id" in nextQuestion) {
        setActiveQuestionId(nextQuestion.question_id)
      }
      setPendingAction(null)
      setEntries(current => [
        ...current,
        {
          id: `assistant-${response.meta.request_id}`,
          role: "assistant",
          text: response.summary,
          response
        }
      ])
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        setError("已停止本次生成。")
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "教学网关暂时不可用，请稍后重试。"
        )
      }
    } finally {
      requestController.current = null
      setIsSending(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submit(input)
  }

  const handleAction = (action: LearningAction) => {
    const prompts: Record<LearningAction["type"], string> = {
      submit_answer: "这是我的答案：",
      request_hint: "只给我下一步提示，先不要揭晓完整答案。",
      generate_variant: "基于刚才的方法，再生成一道结构不同的变式题。"
    }

    if (action.question_id) {
      setActiveQuestionId(action.question_id)
    }
    setPendingAction({
      type: action.type,
      ...(action.question_id ? { question_id: action.question_id } : {}),
      ...(action.schedule_id ? { schedule_id: action.schedule_id } : {}),
      client_event_id: crypto.randomUUID()
    })
    setInput(prompts[action.type])
  }

  return (
    <main className="app-shell">
      <div className="ambient-layer" />

      <aside className="left-rail">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Image src="/branding/logo.jpg" alt="鸢尾花标志" width={52} height={52} priority />
          </div>
          <div>
            <span>IRIS LEARNING TERMINAL</span>
            <strong>TraceTutor</strong>
          </div>
        </div>

        <button className="new-session" onClick={resetSession}>
          <Icon name="plus" size={18} />
          新建学习会话
          <kbd>⌘ K</kbd>
        </button>

        <nav className="primary-nav" aria-label="主要功能">
          <p>学习台</p>
          <button className="active">
            <Icon name="compass" size={18} />
            当前推演
            <span>LIVE</span>
          </button>
          <button>
            <Icon name="history" size={18} />
            学习轨迹
          </button>
        </nav>

        <section className="recent-list">
          <header>
            <p>本轮题目</p>
            <span>{latestQuestionCards.length ? "Agent 返回" : "暂无数据"}</span>
          </header>
          {latestQuestionCards.length ? (
            latestQuestionCards.map(card => (
              <button
                key={card.question_id}
                onClick={() => setActiveQuestionId(card.question_id)}
              >
                <i className="status-dot violet" />
                <span>
                  <strong>{card.title}</strong>
                  <small>{card.question_id}</small>
                </span>
              </button>
            ))
          ) : (
            <p className="empty-rail-copy">完成一次真实调用后显示题目引用。</p>
          )}
        </section>

        <div className="rail-note">
          <Icon name="shield" size={18} />
          <p>
            Iris 只负责输入与渲染
            <span>不直接访问数据库</span>
          </p>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <span className="signal"><i /> 教学工作流</span>
            <h1>{entries.length ? MODE_LABELS[mode] : "新的学习会话"}</h1>
          </div>
          <div className="header-status">
            <span>{gatewayEnabled ? "网关已配置" : "等待网关配置"}</span>
            <i className={gatewayEnabled ? "online" : "demo"} />
          </div>
        </header>

        <div className="conversation" aria-live="polite">
          {entries.length === 0 ? (
            <section className="welcome-panel">
              <div className="welcome-orbit" aria-hidden="true">
                <Image src="/branding/logo.jpg" alt="" width={84} height={84} />
              </div>
              <p className="eyebrow">THE PROOF BEGINS HERE</p>
              <h2>
                把每一道错题
                <br />
                变成下一次的<span>方法</span>
              </h2>
              <p className="welcome-copy">
                从定义出发，沿着证据推进。Iris 展示答案、变式与学习状态，真正的数据查询和写回由网关负责。
              </p>

              <div className="quick-grid">
                {QUICK_STARTS.map(item => (
                  <button
                    key={item.eyebrow}
                    onClick={() => {
                      setMode(item.mode)
                      setPendingAction(null)
                      setInput(item.prompt)
                    }}
                  >
                    <span>{item.eyebrow}</span>
                    <strong>{item.title}</strong>
                    <small>{item.prompt}</small>
                    <b>↗</b>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="message-stream">
              {entries.map(entry =>
                entry.role === "user" ? (
                  <article className="user-message" key={entry.id}>
                    <span>YOU</span>
                    <p>{entry.text}</p>
                  </article>
                ) : (
                  <article className="assistant-message" key={entry.id}>
                    <div className="assistant-heading">
                      <div className="mini-mark">
                        <Image src="/branding/logo.jpg" alt="" width={34} height={34} />
                      </div>
                      <div>
                        <span>IRIS · 教学输出</span>
                        <p>{entry.text}</p>
                      </div>
                    </div>

                    {entry.response ? (
                      <>
                        <div className="learning-card-grid">
                          {entry.response.cards.map((card, index) => (
                            <CardView card={card} key={`${entry.id}-${card.type}-${index}`} />
                          ))}
                        </div>
                        <div className="response-actions">
                          {entry.response.actions.map(action => (
                            <button
                              key={`${action.type}-${action.question_id ?? "none"}-${action.schedule_id ?? "none"}`}
                              onClick={() => handleAction(action)}
                            >
                              {action.label}
                              <span>→</span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </article>
                )
              )}

              {isSending ? (
                <div className="thinking-line">
                  <Icon name="spark" size={18} />
                  <span>正在组织可渲染的教学结果</span>
                  <i /><i /><i />
                </div>
              ) : null}

              {error ? <p className="error-banner">{error}</p> : null}
            </div>
          )}
        </div>

        <footer className="composer-wrap">
          <div className="mode-switch" aria-label="输入模式">
            {(Object.keys(MODE_LABELS) as InputMode[]).map(item => (
              <button
                className={mode === item ? "active" : ""}
                key={item}
                onClick={() => {
                  setMode(item)
                  setPendingAction(null)
                }}
              >
                {MODE_LABELS[item]}
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <button className="attach-button" type="button" aria-label="添加附件" disabled>
              <Icon name="plus" size={21} />
            </button>
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder="输入题目、复习目标，或追问一个没有想通的步骤……"
              rows={1}
              disabled={!gatewayEnabled}
            />
            {isSending ? (
              <button
                className="send-button stop"
                type="button"
                onClick={() => requestController.current?.abort()}
                aria-label="停止生成"
              >
                <span />
              </button>
            ) : (
              <button
                className="send-button"
                type="submit"
                disabled={!gatewayEnabled || !input.trim()}
                aria-label="发送"
              >
                <Icon name="send" size={21} />
              </button>
            )}
          </form>
          <p>
            {gatewayEnabled
              ? "Enter 发送 · Shift + Enter 换行 · 状态变化以规则层结果为准"
              : "请配置 NEXT_PUBLIC_TRACE_TUTOR_GATEWAY_URL 后开始学习"}
          </p>
        </footer>
      </section>

      <aside className="right-rail">
        <header>
          <span>LEARNING SIGNAL</span>
          <strong>学习信号</strong>
        </header>

        <section className="focus-card">
          <div className="focus-ring">
            <span>{latestResponse ? latestResponse.cards.length : "—"}</span>
            <small>结果卡片</small>
          </div>
          <div>
            <small>当前工作流</small>
            <strong>{latestResponse?.mode ?? MODE_LABELS[mode]}</strong>
            <p>
              {latestResponse?.summary ??
                "尚无真实 Agent 响应；这里不会展示伪造掌握度。"}
            </p>
          </div>
        </section>

        <section className="mastery-block">
          <header>
            <span>状态写回</span>
            <small>规则层结果</small>
          </header>
          {latestStateCards.length ? (
            latestStateCards.map((card, index) => (
              <div key={`${card.title}-${index}`}>
                <p>
                  <span>{card.title}</span>
                  <b>{card.status}</b>
                </p>
                <small className="state-detail">{card.content}</small>
              </div>
            ))
          ) : (
            <p className="empty-rail-copy">暂无经过规则层确认的状态变化。</p>
          )}
        </section>

        <section className="boundary-map">
          <header>
            <span>架构边界</span>
            <small>高内聚 · 低耦合</small>
          </header>
          <div>
            <Icon name="database" size={18} />
            <p><strong>PgSQL</strong><span>题目资产 · 只经 API 召回</span></p>
          </div>
          <div>
            <Icon name="database" size={18} />
            <p><strong>SQLite</strong><span>用户状态 · 只经规则层写回</span></p>
          </div>
          <div className="gateway-strip">
            <i />
            <span>两套数据库不互相导入</span>
          </div>
        </section>

        <blockquote>
          “前端呈现状态变化，
          <br />
          但不决定状态如何变化。”
        </blockquote>
      </aside>
    </main>
  )
}
