export interface DatabaseHealth {
  readonly connected: boolean;
  readonly latencyMs: number;
}
