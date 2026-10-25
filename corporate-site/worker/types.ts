export interface D1Result<T = Record<string, unknown>> { success: boolean; results?: T[]; meta?: { changes?: number } }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database { prepare(sql: string): D1Statement; batch<T = Record<string, unknown>>(statements: D1Statement[]): Promise<D1Result<T>[]> }
export interface WorkerEnv {
  DB?: D1Database;
  OWNER_EMAIL?: string;
  /** Cloudflare Turnstile: public site key and confidential server-only secret. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Mandatory on public VPS, independent of widget availability. */
  TURNSTILE_REQUIRED?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** All notification credentials and approval flags are server-only runtime bindings. */
  ASSISTANT_NOTIFICATIONS_ENABLED?: string;
  ASSISTANT_NOTIFY_FROM?: string;
  ASSISTANT_NOTIFY_TO?: string;
  ASSISTANT_PUBLIC_ORIGIN?: string;
  ASSISTANT_EMAIL_DAILY_LIMIT?: string;
  RESEND_API_KEY?: string;
  /** Private ERP bridge bindings. Disabled unless explicitly approved and fully configured. */
  ASSISTANT_ERP_ENABLED?: string;
  ASSISTANT_ERP_ORIGIN?: string;
  ASSISTANT_ERP_SOURCE?: string;
  ASSISTANT_ERP_SITE_ID?: string;
  ASSISTANT_ERP_COMPANY_ID?: string;
  ASSISTANT_ERP_KEY_ID?: string;
  ASSISTANT_ERP_SECRET?: string;
  ASSISTANT_ERP_MAPPING_VERSION?: string;
  ASSISTANT_ERP_SERVICES_JSON?: string;
  STUDIO_AI_ENABLED?: string;
  STUDIO_AI_APPROVED?: string;
  STUDIO_AI_API_KEY?: string;
  STUDIO_AI_MODEL?: string;
  STUDIO_AI_QUOTA_CHECKED_AT?: string;
  STUDIO_AI_DAILY_BUDGET_CENTS?: string;
  STUDIO_AI_REQUEST_COST_CAP_CENTS?: string;
}


export interface WorkerContext { waitUntil(promise:Promise<unknown>):void }
