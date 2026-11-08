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
  /** Stable server-configured owner subject; empty means owner enrollment is pending. */
  OWNER_USER_ID?: string;
  /** Trusted Node VPS only: never sourced from a browser/header. */
  DELEGATED_OWNER_ID?: string;
  DEVELOPER_EMAIL?: string;
  /** Cloudflare Turnstile: public site key and confidential server-only secret. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Mandatory on public VPS, independent of widget availability. */
  TURNSTILE_REQUIRED?: string;
  /** Native static responses default to staging; only this explicit runtime value permits public indexing. */
  KNABA_RELEASE_MODE?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  /** In-process VPS capability only; never a browser claim or environment string. */
  VERIFY_STUDIO_SESSION?: () => boolean;
  /** Trusted request binding: current owner role and cookie for assistant owner routes. */
  VERIFY_ASSISTANT_OWNER_SESSION?: () => boolean;
  /** VPS-only P→L→C coordinator, bound to the original real owner session. */
  COORDINATE_PROFILE_ACCESS?: (input:{userId:string;role:string|null;status:'approved'|'suspended';version:number})=>Promise<unknown>;
  /** Trusted VPS request binding: recheck current session/authority inside the publication transaction. */
  STUDIO_PUBLICATION_BATCH?: (statements:D1Statement[])=>Promise<D1Result[]|null>;
  /** Server-only ERP intake configuration. A source reference grants no ERP identity. */
  KNABA_ERP_BRIDGE_ENABLED?:string;
  KNABA_ERP_TRANSFER_APPROVED?:string;
  KNABA_ERP_URL?:string;
  KNABA_ERP_ALLOWED_ORIGIN?:string;
  KNABA_ERP_COMPANY_ID?:string;
  KNABA_ERP_KEY_ID?:string;
  KNABA_ERP_SECRET?:string;
  KNABA_ERP_MAPPING_VERSION?:string;
  KNABA_ERP_SERVICE_MAP_JSON?:string;
  KNABA_ERP_APPROVED_PRIVACY_VERSION?:string;
  KNABA_ERP_KEY_NOT_BEFORE?:string;
  KNABA_ERP_KEY_NOT_AFTER?:string;
  /** All notification credentials and approval flags are server-only runtime bindings. */
  ASSISTANT_NOTIFICATIONS_ENABLED?: string;
  ASSISTANT_NOTIFY_FROM?: string;
  ASSISTANT_NOTIFY_TO?: string;
  ASSISTANT_PUBLIC_ORIGIN?: string;
  ASSISTANT_EMAIL_DAILY_LIMIT?: string;
  RESEND_API_KEY?: string;
  STUDIO_AI_ENABLED?: string;
  STUDIO_AI_APPROVED?: string;
  STUDIO_AI_API_KEY?: string;
  STUDIO_AI_MODEL?: string;
  STUDIO_AI_QUOTA_CHECKED_AT?: string;
  STUDIO_AI_DAILY_BUDGET_CENTS?: string;
  STUDIO_AI_REQUEST_COST_CAP_CENTS?: string;
}


export interface WorkerContext { waitUntil(promise:Promise<unknown>):void }
