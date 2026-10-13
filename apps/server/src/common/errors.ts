/** 统一业务错误码：0 表示成功，其余与 HTTP 语义对齐 */
export const ErrorCode = {
  OK: 0,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL: 500
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 业务异常：会被统一错误中间件转成 { code, message, traceId } */
export class AppError extends Error {
  readonly status: number;
  readonly code: number;
  readonly details?: unknown;

  constructor(message: string, status: number = ErrorCode.BAD_REQUEST, code?: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code ?? status;
    this.details = details;
  }

  static badRequest(message = '请求参数有误', details?: unknown) {
    return new AppError(message, ErrorCode.BAD_REQUEST, ErrorCode.BAD_REQUEST, details);
  }
  static unauthorized(message = '未登录或登录已过期') {
    return new AppError(message, ErrorCode.UNAUTHORIZED);
  }
  static forbidden(message = '没有权限执行该操作') {
    return new AppError(message, ErrorCode.FORBIDDEN);
  }
  static notFound(message = '资源不存在') {
    return new AppError(message, ErrorCode.NOT_FOUND);
  }
  static conflict(message = '资源冲突') {
    return new AppError(message, ErrorCode.CONFLICT);
  }
  static unprocessable(message = '参数校验失败', details?: unknown) {
    return new AppError(message, ErrorCode.UNPROCESSABLE, ErrorCode.UNPROCESSABLE, details);
  }
  static internal(message = '服务器内部错误') {
    return new AppError(message, ErrorCode.INTERNAL);
  }
}
