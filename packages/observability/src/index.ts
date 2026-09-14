export interface LogContext {
  readonly traceId: string;
  readonly intentId?: string;
  readonly executionId?: string;
}
