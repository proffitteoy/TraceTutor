"use client"

import { MathMarkdown } from "@/components/math-markdown"
import type {
  InputMode,
  LearningAction,
  LearningCard,
  LearningRequest,
  LearningResponse,
  PracticeQuestion,
  QuestionAttemptHistoryItem
} from "@/lib/contracts"
import { createGateway } from "@/lib/gateway"
import type { ConversationEntry } from "@/lib/learning-tree"
import Image from "next/image"
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"

const QUESTION_TYPE_LABELS: Record<string, string> = {
  calculation: "计算题",
  proof: "证明题",
  single_choice: "单选题",
  multiple_choice: "多选题",
  fill_blank: "填空题",
  programming: "编程题",
  essay: "解答题"
}

const CARD_LABELS: Record<LearningCard["type"], string> = {
  solution: "参考解法",
  method_summary: "方法总结",
  method_diagnosis: "方法诊断",
  method_comparison: "方法比较",
  new_question: "下一题",
  old_question_review: "复习题",
  state_change: "学习状态"
}

const SUBJECT_ORDER = ["mathematical_analysis", "advanced_algebra", "analytic_geometry"]

function getBrowserIdentity(storage: Storage, key: string): string {
  const existing = storage.getItem(key)
  if (existing) return existing
  const created = crypto.randomUUID()
  storage.setItem(key, created)
  return created
}

function Icon({
  name,
  size = 18
}: {
  name: "plus" | "search" | "send" | "hint" | "check" | "arrow" | "spark"
  size?: number
}) {
  const paths = {
    plus: "M12 5v14M5 12h14",
    search: "m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
    send: "m22 2-7 20-4-9-9-4 20-7Zm0 0L11 13",
    hint: "M9 18h6m-5 3h4m4-10a6 6 0 1 0-10.5 4c.8.8 1.5 1.8 1.5 3h6c0-1.2.7-2.2 1.5-3A5.9 5.9 0 0 0 18 11Z",
    check: "m5 12 4 4L19 6",
    arrow: "m9 18 6-6-6-6",
    spark: "m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z"
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  )
}

function Difficulty({ value }: { value: number }) {
  return (
    <span className="difficulty" aria-label={`难度 ${value} / 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i className={index < value ? "filled" : ""} key={index} />
      ))}
    </span>
  )
}

function formatAttemptTime(value: string): string {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)
}

function attemptVerdict(attempt: QuestionAttemptHistoryItem): string {
  if (attempt.isCorrect === true) return "正确"
  if (attempt.isCorrect === false) return "需要订正"
  return attempt.attemptStatus === "submitted" ? "已提交" : "待判定"
}

function LearningCardView({ card }: { card: LearningCard }) {
  if (card.type === "state_change") return null

  return (
    <section className={`response-card response-card-${card.type}`}>
      <span className="response-card-label">{CARD_LABELS[card.type]}</span>
      <h4>{card.title}</h4>
      <MathMarkdown content={card.content} />

      {card.type === "solution" && card.steps.length ? (
        <ol>
          {card.steps.map((step, index) => (
            <li key={`${index}-${step}`}><MathMarkdown content={step} /></li>
          ))}
        </ol>
      ) : null}

      {card.type === "solution" && card.methods.length ? (
        <div className="method-tags">
          {card.methods.map(method => <span key={method}>{method}</span>)}
        </div>
      ) : null}

      {"tags" in card && card.tags?.length ? (
        <div className="method-tags">
          {card.tags.map(tag => <span key={tag}>{tag}</span>)}
        </div>
      ) : null}

      {"difficulty" in card && card.difficulty ? (
        <Difficulty value={card.difficulty} />
      ) : null}
    </section>
  )
}

interface TutorShellProps {
  initialQuestions?: Record<string, unknown>[]
  initialServiceStatus?: "ready" | "degraded" | "checking"
  initialServiceError?: string | null
}

export function TutorShell({
  initialQuestions = [],
  initialServiceStatus = "checking",
  initialServiceError = null,
}: TutorShellProps) {
  const gateway = useMemo(() => createGateway(), [])
  const requestController = useRef<AbortController | null>(null)
  const answerInput = useRef<HTMLTextAreaElement | null>(null)
  const streamEnd = useRef<HTMLDivElement | null>(null)
  const [questions, setQuestions] = useState<PracticeQuestion[]>(() =>
    initialQuestions.length > 0 ? initialQuestions as unknown as PracticeQuestion[] : []
  )
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState("")
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)
  const [subjectCode, setSubjectCode] = useState("all")
  const [search, setSearch] = useState("")
  const [answer, setAnswer] = useState("")
  const [entries, setEntries] = useState<ConversationEntry[]>([])
  const [questionHistory, setQuestionHistory] = useState<QuestionAttemptHistoryItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(initialQuestions.length === 0)
  const [isSending, setIsSending] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [serviceStatus, setServiceStatus] = useState<"checking" | "ready" | "degraded">(initialServiceStatus)

  const selectedQuestion = questions.find(
    question => question.questionId === selectedQuestionId
  ) ?? null
  const canUseAgent = gateway !== null && (serviceStatus === "ready" || serviceStatus === "degraded")

  const subjects = useMemo(() => {
    const seen = new Map<string, string>()
    questions.forEach(question => seen.set(question.subjectCode, question.subjectName))
    return [...seen.entries()].sort(([left], [right]) => {
      const leftIndex = SUBJECT_ORDER.indexOf(left)
      const rightIndex = SUBJECT_ORDER.indexOf(right)
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex)
    })
  }, [questions])

  const visibleQuestions = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("zh-CN")
    return questions.filter(question => {
      if (subjectCode !== "all" && question.subjectCode !== subjectCode) return false
      if (!keyword) return true
      return `${question.title}\n${question.stem}`.toLocaleLowerCase("zh-CN").includes(keyword)
    })
  }, [questions, search, subjectCode])

  const loadQuestions = useCallback(async () => {
    if (!gateway) {
      setCatalogError("本地教学服务尚未配置")
      setIsLoadingQuestions(false)
      return
    }
    const controller = new AbortController()
    setIsLoadingQuestions(true)
    setCatalogError(null)
    try {
      const loaded = await gateway.listPracticeQuestions({ limit: 66 }, controller.signal)
      setQuestions(loaded)
      setSelectedQuestionId(current => current ?? loaded[0]?.questionId ?? null)
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "题库暂时不可用")
    } finally {
      setIsLoadingQuestions(false)
    }
    return () => controller.abort()
  }, [gateway])

  const loadQuestionHistory = useCallback(async (
    questionId: string,
    signal?: AbortSignal
  ) => {
    if (!gateway) return
    setIsLoadingHistory(true)
    setHistoryError(null)
    try {
      const attempts = await gateway.listQuestionAttempts({
        userId: getBrowserIdentity(localStorage, "tracetutor.user_id"),
        questionId,
        limit: 20
      }, signal)
      setQuestionHistory(attempts)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setQuestionHistory([])
      setHistoryError(error instanceof Error ? error.message : "本题历史暂时不可用")
    } finally {
      setIsLoadingHistory(false)
    }
  }, [gateway])

  useEffect(() => {
    if (initialQuestions.length > 0) return
    void loadQuestions()
  }, [loadQuestions, initialQuestions.length])

  useEffect(() => {
    if (initialServiceStatus !== "checking") return
    if (!gateway) {
      setServiceStatus("degraded")
      return
    }
    const controller = new AbortController()
    void gateway.checkReadiness(controller.signal).then(status => {
      setServiceStatus(status.ready ? "ready" : "degraded")
    })
    return () => controller.abort()
  }, [gateway, initialServiceStatus])

  useEffect(() => {
    setSessionId(getBrowserIdentity(sessionStorage, "tracetutor.session_id"))
  }, [])

  useEffect(() => {
    if (!selectedQuestionId) {
      setQuestionHistory([])
      setHistoryError(null)
      return
    }
    const controller = new AbortController()
    void loadQuestionHistory(selectedQuestionId, controller.signal)
    return () => controller.abort()
  }, [loadQuestionHistory, selectedQuestionId])

  useEffect(() => {
    streamEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [entries, isSending])

  const selectQuestion = (question: PracticeQuestion) => {
    if (isSending) return
    setSelectedQuestionId(question.questionId)
    setAnswer("")
    setRequestError(null)
    setSessionNotice(null)
    requestAnimationFrame(() => answerInput.current?.focus())
  }

  const resetSession = () => {
    const nextSessionId = crypto.randomUUID()
    sessionStorage.setItem("tracetutor.session_id", nextSessionId)
    setSessionId(nextSessionId)
    setSelectedQuestionId(null)
    setSubjectCode("all")
    setSearch("")
    setEntries([])
    setAnswer("")
    setRequestError(null)
    setSessionNotice(`新对话已创建 · ${nextSessionId.slice(0, 8)}`)
    requestController.current?.abort()
    requestAnimationFrame(() => answerInput.current?.focus())
  }

  const submit = async (
    text: string,
    inputMode: InputMode,
    action?: LearningRequest["action"],
    visibleText = text
  ) => {
    const normalized = text.trim()
    if (!normalized || !gateway || !canUseAgent || isSending) return
    if (action && !selectedQuestion) return

    const userEntry: ConversationEntry = {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      text: visibleText
    }
    setEntries(current => [...current, userEntry])
    setAnswer("")
    setRequestError(null)
    setIsSending(true)

    const controller = new AbortController()
    requestController.current = controller
    const request: LearningRequest = {
      session_id: sessionId || getBrowserIdentity(sessionStorage, "tracetutor.session_id"),
      user_id: getBrowserIdentity(localStorage, "tracetutor.user_id"),
      input_mode: inputMode,
      user_text: normalized,
      attachments: [],
      active_question_id: selectedQuestion?.questionId ?? null,
      ...(action ? { action } : {})
    }

    try {
      const response = await gateway.send(request, controller.signal)
      setServiceStatus("ready")
      setEntries(current => [
        ...current,
        {
          id: `assistant-${response.meta.request_id}`,
          role: "assistant",
          text: response.summary,
          response
        }
      ])
      if (selectedQuestion) {
        await loadQuestionHistory(selectedQuestion.questionId)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setRequestError("本次请求已停止")
      } else {
        setServiceStatus("degraded")
        setRequestError(error instanceof Error ? error.message : "Iris 暂时无法响应")
      }
    } finally {
      requestController.current = null
      setIsSending(false)
    }
  }

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedQuestion) {
      void submit(answer, "free_chat")
      return
    }
    void submit(
      answer,
      "review",
      {
        type: "submit_answer",
        question_id: selectedQuestion.questionId,
        client_event_id: crypto.randomUUID()
      }
    )
  }

  const requestHint = () => {
    if (!selectedQuestion) return
    void submit(
      "请只给我一个能继续推导的提示，不要直接给出完整答案。",
      "review",
      {
        type: "request_hint",
        question_id: selectedQuestion.questionId,
        client_event_id: crypto.randomUUID()
      },
      "给我一个提示"
    )
  }

  const askQuestion = () => {
    void submit(answer, "free_chat")
  }

  const handleAgentAction = (action: LearningAction) => {
    if (!selectedQuestion) return
    if (action.type === "submit_answer") {
      answerInput.current?.focus()
      return
    }
    const prompt = action.type === "request_hint"
      ? "请只给我下一步提示。"
      : "基于刚才的方法，再给我一道结构不同的变式题。"
    void submit(
      prompt,
      action.type === "request_hint" ? "review" : "new_question",
      {
        type: action.type,
        question_id: action.question_id ?? selectedQuestion.questionId,
        ...(action.schedule_id ? { schedule_id: action.schedule_id } : {}),
        client_event_id: crypto.randomUUID()
      },
      action.label
    )
  }

  return (
    <main className="practice-shell">
      <aside className="catalog-panel">
        <header className="catalog-brand">
          <Image src="/branding/logo.jpg" alt="TraceTutor" width={44} height={44} priority />
          <div>
            <strong>TraceTutor</strong>
            <span>数学做题工作台</span>
          </div>
        </header>

        <button className="new-practice" onClick={resetSession} type="button">
          <Icon name="plus" />
          新建对话
        </button>

        <div className="catalog-heading">
          <div>
            <strong>题库</strong>
            <span>{questions.length ? `${questions.length} 道已批准题` : "正在连接"}</span>
          </div>
          <label className="catalog-search">
            <Icon name="search" size={15} />
            <input
              aria-label="搜索题目"
              onChange={event => setSearch(event.target.value)}
              placeholder="搜索题目"
              value={search}
            />
          </label>
        </div>

        <div className="subject-tabs" role="tablist" aria-label="题目学科">
          <button
            className={subjectCode === "all" ? "active" : ""}
            onClick={() => setSubjectCode("all")}
            type="button"
          >
            全部
          </button>
          {subjects.map(([code, name]) => (
            <button
              className={subjectCode === code ? "active" : ""}
              key={code}
              onClick={() => setSubjectCode(code)}
              type="button"
            >
              {name}
            </button>
          ))}
        </div>

        <div className="question-list">
          {isLoadingQuestions ? (
            <div className="catalog-state"><i /><span>正在读取题库…</span></div>
          ) : catalogError ? (
            <div className="catalog-state error">
              <span>{catalogError}</span>
              <button onClick={() => void loadQuestions()} type="button">重试</button>
            </div>
          ) : visibleQuestions.length ? (
            visibleQuestions.map((question, index) => (
              <button
                className={selectedQuestionId === question.questionId ? "active" : ""}
                key={question.questionId}
                onClick={() => selectQuestion(question)}
                type="button"
              >
                <span className="question-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="question-list-copy">
                  <strong>{question.title}</strong>
                  <small>{question.subjectName} · {QUESTION_TYPE_LABELS[question.questionType] ?? "题目"}</small>
                </span>
                <Difficulty value={question.difficulty} />
              </button>
            ))
          ) : (
            <div className="catalog-state"><span>没有匹配的题目</span></div>
          )}
        </div>
      </aside>

      <section className="practice-workspace">
        <header className="workspace-bar">
          <div>
            <span className="workspace-label">当前练习</span>
            <strong>{selectedQuestion?.subjectName ?? "选择一道题开始"}</strong>
          </div>
          <div className="workspace-statuses">
            {sessionId ? <span className="session-code">对话 {sessionId.slice(0, 8)}</span> : null}
            <span className={`service-state ${serviceStatus === "ready" || serviceStatus === "degraded" ? "ready" : "offline"}`}>
              <i />{serviceStatus === "ready" ? "Iris 已就绪" : serviceStatus === "degraded" ? "题库已就绪 · 模型未连接" : serviceStatus === "checking" ? "正在检查服务" : "Iris 不可用"}
            </span>
          </div>
        </header>

        <div className="practice-scroll">
          {sessionNotice ? (
            <button
              className="session-notice"
              onClick={() => setSessionNotice(null)}
              type="button"
            >
              <Icon name="check" size={15} />
              {sessionNotice}
              <span>{selectedQuestion ? "可继续当前题，本题历史已保留" : "对话窗已就绪，可直接输入或选择题目"}</span>
            </button>
          ) : null}
          <div className={`practice-content ${selectedQuestion ? "" : "free-chat-content"}`}>
              {selectedQuestion ? (
              <article className="question-sheet">
                <header>
                  <div className="question-badges">
                    <span>{QUESTION_TYPE_LABELS[selectedQuestion.questionType] ?? "题目"}</span>
                    <span>{selectedQuestion.subjectName}</span>
                  </div>
                  <Difficulty value={selectedQuestion.difficulty} />
                </header>
                <h1>{selectedQuestion.title}</h1>
                <MathMarkdown className="question-stem" content={selectedQuestion.stem} />
                <section className="question-history" aria-label="本题作答历史">
                  <header>
                    <div>
                      <strong>本题历史</strong>
                      <span>{questionHistory.length ? `${questionHistory.length} 次作答` : "还没有作答记录"}</span>
                    </div>
                    {isLoadingHistory ? <i className="history-loading" /> : null}
                  </header>
                  {historyError ? (
                    <div className="history-error">
                      <span>{historyError}</span>
                      <button onClick={() => void loadQuestionHistory(selectedQuestion.questionId)} type="button">重试</button>
                    </div>
                  ) : questionHistory.length ? (
                    <div className="history-list">
                      {questionHistory.map((attempt, index) => (
                        <article key={attempt.attemptId}>
                          <span className={`history-verdict ${attempt.isCorrect === true ? "correct" : attempt.isCorrect === false ? "incorrect" : "pending"}`}>
                            {attemptVerdict(attempt)}
                          </span>
                          <div>
                            <strong>第 {questionHistory.length - index} 次</strong>
                            <time>{formatAttemptTime(attempt.createdAt)}</time>
                            {attempt.userAnswerText ? <MathMarkdown content={attempt.userAnswerText} /> : <p>未记录文本答案</p>}
                            {attempt.errorDetailText ? <small>{attempt.errorDetailText}</small> : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : isLoadingHistory ? null : (
                    <p className="history-empty">提交答案并完成判题后，记录会保存在 SQLite。</p>
                  )}
                </section>
              </article>
              ) : (
                <header className="free-chat-heading">
                  <span>新对话</span>
                  <h1>直接和 Iris 对话</h1>
                  <p>可以先描述问题，也可以随时从左侧选择一道题加入当前对话。</p>
                </header>
              )}

              <form className="answer-sheet" onSubmit={submitAnswer}>
                <label htmlFor="answer-input">{selectedQuestion ? "你的解答或问题" : "输入消息"}</label>
                <textarea
                  id="answer-input"
                  onChange={event => setAnswer(event.target.value)}
                  onKeyDown={event => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                  placeholder={selectedQuestion ? "写下推导过程、最终答案，或直接向 Iris 提问…" : "输入你想讨论的问题…"}
                  ref={answerInput}
                  rows={5}
                  value={answer}
                />
                <div className="answer-actions">
                  <button
                    className="primary-action"
                    disabled={!canUseAgent || !answer.trim() || isSending}
                    type="submit"
                  >
                    <Icon name={selectedQuestion ? "check" : "send"} />{selectedQuestion ? "提交答案" : "发送"}
                  </button>
                  {selectedQuestion ? (
                    <>
                      <button
                        disabled={!canUseAgent || isSending}
                        onClick={requestHint}
                        type="button"
                      >
                        <Icon name="hint" />给我提示
                      </button>
                      <button
                        disabled={!canUseAgent || !answer.trim() || isSending}
                        onClick={askQuestion}
                        type="button"
                      >
                        <Icon name="send" />继续提问
                      </button>
                    </>
                  ) : null}
                  <span>Ctrl + Enter {selectedQuestion ? "提交答案" : "发送"}</span>
                </div>
              </form>

              {entries.length || isSending || requestError ? (
                <section className="dialogue-section">
                  <header>
                    <span>辅导对话 · {sessionId ? sessionId.slice(0, 8) : "正在建立"}</span>
                    <i />
                  </header>
                  <div className="dialogue-stream" aria-live="polite">
                    {entries.map(entry => entry.role === "user" ? (
                      <article className="dialogue-user" key={entry.id}>
                        <span>你</span>
                        <MathMarkdown content={entry.text} />
                      </article>
                    ) : (
                      <article className="dialogue-agent" key={entry.id}>
                        <header>
                          <span className="iris-mark"><Icon name="spark" size={16} /></span>
                          <div><strong>Iris</strong><small>判题与讲解</small></div>
                        </header>
                        <MathMarkdown className="agent-summary" content={entry.text} />
                        {entry.response ? (
                          <>
                            <div className="response-grid">
                              {entry.response.cards.map((card, index) => (
                                <LearningCardView card={card} key={`${entry.id}-${card.type}-${index}`} />
                              ))}
                            </div>
                            {entry.response.actions.length ? (
                              <div className="agent-actions">
                                {entry.response.actions.map(action => (
                                  <button
                                    key={`${action.type}-${action.question_id ?? "none"}`}
                                    onClick={() => handleAgentAction(action)}
                                    type="button"
                                  >
                                    {action.label}<Icon name="arrow" size={14} />
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </article>
                    ))}
                    {isSending ? (
                      <div className="agent-thinking">
                        <Icon name="spark" /><span>Iris 正在判题并组织反馈</span><i /><i /><i />
                      </div>
                    ) : null}
                    {requestError ? <p className="request-error">{requestError}</p> : null}
                    <div ref={streamEnd} />
                  </div>
                </section>
              ) : null}
            </div>
        </div>
      </section>

    </main>
  )
}
