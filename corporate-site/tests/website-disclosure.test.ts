import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const load=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');

describe('KnaBa Assistant and public legal privacy gates',()=>{
  it('exposes a visible same-window login and honest registration entry',()=>{
    const ui=load('../src/components/Portal.tsx');
    const node=load('../vps/server.mjs');
    const layout=load('../src/layouts/Layout.astro');
    expect(ui).toContain('function LoginFields');
    expect(ui).toContain("credentials:'same-origin'");
    expect(ui).toContain('onSuccess={refresh}');
    expect(ui).toContain('portal-access-request');
    expect(node).toContain('const jsonLogin=');
    expect(node).toContain("'Set-Cookie':sessionCookie(result.token");
    expect(layout).toContain('https://vsp.rest/');
    expect(layout).toContain('mobile-account-entry');
  });
  it('does not invoke third-party Turnstile before the visitor acknowledges privacy',()=>{
    const view=load('../src/components/KnabaAssistant.tsx');
    expect(view).toContain('<Show when={!ticket() && accepted()}>');
    expect(view).toContain('<AssistantCaptcha');
    expect(view).toContain('ka-captcha-hint');
    expect(view).not.toContain('target="_blank"');
  });
  it('discloses the actual external challenge provider on DE and RU privacy pages',()=>{
    for(const language of ['', 'ru/']){
      const page=load('../src/pages/'+language+'datenschutz.astro');
      expect(page).toContain('Cloudflare Turnstile');
      expect(page).toContain('https://www.cloudflare.com/de-de/privacypolicy/');
    }
  });
  it('does not describe outdated office illustrations as the current construction identity',()=>{
    expect(load('../src/pages/impressum.astro')).not.toContain('Die Büroillustration');
  });
});
