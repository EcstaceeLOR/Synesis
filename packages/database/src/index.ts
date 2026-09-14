export interface DatabaseHealth {
  readonly connected: boolean;
  readonly latencyMs: number;
}

export * from "./migrations.js";
export * from "./repositories.js";
