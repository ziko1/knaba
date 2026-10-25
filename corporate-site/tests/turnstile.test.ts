import {afterEach,describe,expect,it,vi} from 'vitest';
import {captchaConfig,verifyCaptcha} from '../worker/turnstile';
import type {WorkerEnv} from '../worker/types';

const enabled:WorkerEnv={
  TURNSTILE_SITE_KEY:'0x4AAAAAAAAtestsite',
  TURNSTILE_SECRET_KEY:'0x4BBBBBBBBtestsecret',
};
const request=new Request('https://kneba.vsp.rest/api/assistant/conversations',{method:'POST'});

afterEach(()=>{vi.unstubAllGlobals();});

describe('Assistant Turnstile server-side verification',()=>{
  it('is explicitly disabled only if both keys are absent and fails closed for half configured',async()=>{
    expect(captchaConfig({})).toEqual({enabled:false,sitekey:null,unavailable:false});
    expect(await verifyCaptcha(request,{},'')).toBe('ok');
    expect(captchaConfig({TURNSTILE_SITE_KEY:enabled.TURNSTILE_SITE_KEY}).unavailable).toBe(true);
    expect(await verifyCaptcha(request,{TURNSTILE_SITE_KEY:enabled.TURNSTILE_SITE_KEY},'sampletoken123')).toBe('unavailable');
    expect(captchaConfig(enabled)).toEqual({enabled:true,sitekey:enabled.TURNSTILE_SITE_KEY,unavailable:false});
  });
  it('rejects missing/too-long tokens before contacting Cloudflare',async()=>{
    const network=vi.fn();
    vi.stubGlobal('fetch',network);
    expect(await verifyCaptcha(request,enabled,undefined)).toBe('invalid');
    expect(await verifyCaptcha(request,enabled,'x'.repeat(2049))).toBe('invalid');
    expect(network).not.toHaveBeenCalled();
  });
  it('accepts only success tokens for the exact KnaBa hostname',async()=>{
    const network=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,hostname:'kneba.vsp.rest'})));
    vi.stubGlobal('fetch',network);
    expect(await verifyCaptcha(request,enabled,'turnstile-validation-token')).toBe('ok');
    expect(network).toHaveBeenCalledOnce();
    const [url,opts]=network.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const args=new URLSearchParams(opts.body as URLSearchParams);
    expect(args.get('response')).toBe('turnstile-validation-token');
    expect(args.get('secret')).toBe(enabled.TURNSTILE_SECRET_KEY);
    network.mockResolvedValueOnce(new Response(JSON.stringify({success:true,hostname:'evil.test'})));
    expect(await verifyCaptcha(request,enabled,'another-valid-token')).toBe('invalid');
    network.mockResolvedValueOnce(new Response(JSON.stringify({success:false,hostname:'kneba.vsp.rest'})));
    expect(await verifyCaptcha(request,enabled,'yet-another-token')).toBe('invalid');
  });
  it('fails closed on service failure or malformed JSON',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));
    expect(await verifyCaptcha(request,enabled,'some-long-token')).toBe('unavailable');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>failure</html>',{status:200})));
    expect(await verifyCaptcha(request,enabled,'some-long-token')).toBe('unavailable');
  });
});
