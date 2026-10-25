import type { WorkerEnv } from './types';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export type CaptchaConfig = { enabled: boolean; sitekey: string | null; unavailable: boolean };

/** Production requires both credentials; only explicit local test mode may omit them. */
export function captchaConfig(env: WorkerEnv): CaptchaConfig {
  const sitekey=(env.TURNSTILE_SITE_KEY ?? '').trim();
  const secret=(env.TURNSTILE_SECRET_KEY ?? '').trim();
  if (!sitekey && !secret) return {enabled:false, sitekey:null, unavailable:env.TURNSTILE_REQUIRED==='1'};
  if (!/^[a-zA-Z0-9_-]{12,128}$/.test(sitekey) || !/^[a-zA-Z0-9_-]{12,128}$/.test(secret))
    return {enabled:false, sitekey:null, unavailable:true};
  return {enabled:true, sitekey, unavailable:false};
}

/** Verify the one-time token on the server, bounded by 6 seconds, including the expected hostname. */
export async function verifyCaptcha(request: Request, env: WorkerEnv, token: unknown): Promise<'ok' | 'invalid' | 'unavailable'> {
  const config=captchaConfig(env);
  if (config.unavailable) return 'unavailable';
  if (!config.enabled) return 'ok';
  if (typeof token!=='string' || token.length<10 || token.length>2048) return 'invalid';
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6_000);
  try {
    const response=await fetch(VERIFY_URL,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY!,response:token}),
      signal:controller.signal,
    });
    if (!response.ok) return 'unavailable';
    const result=await response.json() as { success?:unknown; hostname?:unknown };
    if (result.success!==true || result.hostname!==new URL(request.url).hostname) return 'invalid';
    return 'ok';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
