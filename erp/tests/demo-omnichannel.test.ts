import {describe,expect,it,vi,afterEach} from 'vitest';
import {buildBotWalkthrough} from '../scripts/demo-omnichannel.ts';
import {telegramPublicIntent} from '../packages/integrations/telegram-public-navigation.ts';

afterEach(()=>vi.unstubAllGlobals());
describe('customer bot walkthrough: production classifier, offline presentation only',()=>{
  it('shows actual DE/EN/RU public scenarios with no provider or storage I/O',()=>{
    const fetcher=vi.fn();
    vi.stubGlobal('fetch',fetcher);
    const output=buildBotWalkthrough();
    expect(output).toContain('STATUS: PROTOCOL / PUBLIC INTENT SIMULATION ONLY');
    expect(output).toContain('Real messages: 0 | Database writes: 0');
    expect(output).toContain('HMAC verification: PASS');
    for(const command of ['/start','/services','/request','/register','/call','/human'])
      expect(output).toContain(command+' => ');
    for(const language of ['DE','EN','RU'])expect(output).toContain('['+language+']');
    expect(output).toContain('owner UAT');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not reinterpret guest text as an operator identity',()=>{
    expect(telegramPublicIntent('/approve')).toBeUndefined();
    expect(telegramPublicIntent('/grant OWNER')).toBeUndefined();
    expect(telegramPublicIntent('/admin')).toBeUndefined();
  });
});
