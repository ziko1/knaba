export interface D1Result<T = Record<string, unknown>> { success: boolean; results?: T[]; meta?: { changes?: number } }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database { prepare(sql: string): D1Statement; batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]> }
export interface WorkerEnv { DB?: D1Database; OWNER_EMAIL?: string; ASSETS?: { fetch(request: Request): Promise<Response> } }
