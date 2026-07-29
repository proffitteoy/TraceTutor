export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_QUERY_PLAN"
  | "INVALID_STATE_DELTA"
  | "INVALID_TOOL_RESULT"
  | "DEPENDENCY_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "MODEL_OUTPUT_INVALID"
  | "TOOL_EXECUTION_ERROR"
  | "NOT_FOUND"
  | "INTERNAL_ERROR"

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number,
    readonly details?: unknown
  ) {
    super(message)
    this.name = "AppError"
  }
}
