import { describe, expect, it, vi } from 'vitest';
import { speechLanguage, browserVoiceSupport, createBrowserVoiceController } from '../src/lib/assistant-voice';

describe('browser voice policy', () => {
  it.each([['de','de-DE'],['en','en-GB'],['ru','ru-RU'],['uk','uk-UA']] as const)(
    'maps %s to %s for STT and TTS', (locale, expected) => expect(speechLanguage(locale)).toBe(expected)
  );
  it('disables microphone in insecure contexts even if a browser API exists', () => {
    const scope = {isSecureContext:false,webkitSpeechRecognition:class {},speechSynthesis:{}} as never;
    expect(browserVoiceSupport(scope).recognition).toBe(false);
  });
  it('does not fake voice readiness when browser capability is absent', () => {
    expect(browserVoiceSupport({isSecureContext:true} as never)).toEqual({recognition:false,synthesis:false});
  });
});
describe('voice lifecycle', () => {
  function fixture() {
    let recognition: {
      onresult: ((event:{results:{0:{transcript:string};isFinal:boolean}[]})=>void)|null,
      onend: (()=>void)|null, onerror: ((error:{error:string})=>void)|null,
      start:ReturnType<typeof vi.fn>, abort:ReturnType<typeof vi.fn>,stop:ReturnType<typeof vi.fn>,lang:string,
      continuous:boolean,interimResults:boolean,maxAlternatives:number
    } | null = null;
    const synthesis = {speak:vi.fn(),cancel:vi.fn(),getVoices:vi.fn(()=>[] as SpeechSynthesisVoice[])};
    class Recognition {
      lang = '';continuous=true;interimResults=true;maxAlternatives=10;
      onresult=null;onend=null;onerror=null;
      start=vi.fn();abort=vi.fn();stop=vi.fn();
      constructor(){recognition=this as never;}
    }
    class Utterance {lang='';rate=1;text:string;onend: (()=>void)|null=null;onerror: (()=>void)|null=null;constructor(t:string){this.text=t;}}
    const scope = {isSecureContext:true,SpeechRecognition:Recognition,SpeechSynthesisUtterance:Utterance,speechSynthesis:synthesis};
    const transcripts:string[]=[];const statuses:string[]=[];
    const controller=createBrowserVoiceController(scope as never,t=>transcripts.push(t),s=>statuses.push(s));
    return {controller,transcripts,statuses,synthesis,get recognition(){return recognition!;}};
  }
  it('listens once and hands only final transcript to callback', () => {
    const f=fixture();expect(f.controller.start('de')).toBe(true);
    expect(f.recognition.lang).toBe('de-DE');
    f.recognition.onresult?.({results:[{0:{transcript:'  Guten Tag  '},isFinal:true}]});
    expect(f.transcripts).toEqual(['Guten Tag']);
    expect(f.recognition.stop).toHaveBeenCalled();
  });
  it('cancels microphone and speech on explicit stop and drops stale events', () => {
    const f=fixture();f.controller.start('ru');const old=f.recognition.onresult;
    f.controller.stop();
    old?.({results:[{0:{transcript:'ignored'},isFinal:true}]});
    expect(f.transcripts).toEqual([]);
    expect(f.recognition.abort).toHaveBeenCalled();
    expect(f.synthesis.cancel).toHaveBeenCalled();
  });
  it('speaks with explicitly selected locale only after a deliberate action', () => {
    const f=fixture();f.controller.speak('Здравствуйте', 'ru');
    expect(f.synthesis.speak).toHaveBeenCalledOnce();
    expect(f.synthesis.speak.mock.calls[0][0].lang).toBe('ru-RU');
  });
});
