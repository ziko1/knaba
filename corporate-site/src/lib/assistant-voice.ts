import type { AssistantLocale } from './public-assistant';

export type VoiceState = 'idle'|'listening'|'speaking'|'unsupported'|'mic-denied'|'no-speech'|'recognition-error'|'voice-unavailable'|'synthesis-error'|'too-long';

type ResultEvent = {results: ArrayLike<{0:{transcript:string};isFinal:boolean}>};
type Recognition = {
  lang:string; continuous:boolean; interimResults:boolean; maxAlternatives:number;
  onresult:((event:ResultEvent)=>void)|null;
  onend:(()=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  start():void; stop():void; abort():void;
};
type VoicePlatform = {
  isSecureContext:boolean;
  SpeechRecognition?:new()=>Recognition;
  webkitSpeechRecognition?:new()=>Recognition;
  speechSynthesis?:Pick<SpeechSynthesis,'speak'|'cancel'|'getVoices'>;
  SpeechSynthesisUtterance?:new(text:string)=>SpeechSynthesisUtterance;
};
const defaultPlatform = ():VoicePlatform|undefined => typeof window === 'undefined' ? undefined : window as unknown as VoicePlatform;
const langByLocale:Record<AssistantLocale,string> = {de:'de-DE',en:'en-GB',ru:'ru-RU',uk:'uk-UA'};
export function speechLanguage(locale:AssistantLocale):string { return langByLocale[locale]; }

export function browserVoiceSupport(platform:VoicePlatform|undefined = defaultPlatform()):{recognition:boolean;synthesis:boolean} {
  return {
    recognition:!!(platform?.isSecureContext && (platform.SpeechRecognition || platform.webkitSpeechRecognition)),
    synthesis:!!(platform?.speechSynthesis && platform.SpeechSynthesisUtterance),
  };
}

/** Gesture-controlled Web Speech adapter. No audio, transcript or identifier is persisted here.
 * Browser engines can use remote speech processing; disclose this before the user starts.
 * Never auto-restart listening after speaking or a denied permission.
 */
export function createBrowserVoiceController(
  platform:VoicePlatform|undefined,
  onTranscript:(text:string)=>void,
  onState:(state:VoiceState)=>void,
) {
  const scope=platform ?? defaultPlatform();
  let current:Recognition|null=null;
  let generation=0;

  function stop(){
    generation++;
    if(current){
      const previous=current;current=null;
      previous.onresult=null;previous.onerror=null;previous.onend=null;
      try {previous.abort();} catch { /* browser may have already stopped */ }
    }
    try {scope?.speechSynthesis?.cancel();} catch { /* unsupported vendor implementation */ }
    onState('idle');
  }

  function start(locale:AssistantLocale):boolean {
    stop();
    const support=browserVoiceSupport(scope);
    const Ctor=scope?.SpeechRecognition ?? scope?.webkitSpeechRecognition;
    if(!support.recognition||!Ctor){onState('unsupported');return false;}
    const ticket=generation;
    try {
      const rec=new Ctor();
      current=rec;
      rec.lang=speechLanguage(locale);
      rec.continuous=false;rec.interimResults=false;rec.maxAlternatives=1;
      rec.onresult=event=>{
        if(ticket!==generation) return;
        const first=event.results[0];
        if(!first || first.isFinal===false) return;
        const transcript=first[0]?.transcript?.trim() ?? '';
        if(transcript.length>500){onState('too-long');rec.stop();return;}
        if(transcript){
          rec.stop();
          onState('idle');
          onTranscript(transcript);
        }
      };
      rec.onerror=event=>{
        if(ticket!==generation) return;
        onState(event.error==='not-allowed'||event.error==='service-not-allowed'?'mic-denied':event.error==='no-speech'?'no-speech':'recognition-error');
      };
      rec.onend=()=>{
        if(ticket!==generation) return;
        if(current===rec) current=null;
      };
      rec.start();onState('listening');
      return true;
    } catch {
      stop();onState('recognition-error');return false;
    }
  }

  function speak(text:string,locale:AssistantLocale):boolean {
    stop();
    if(!browserVoiceSupport(scope).synthesis){onState('unsupported');return false;}
    const synth=scope!.speechSynthesis!;
    const voices=synth.getVoices();
    const language=speechLanguage(locale);
    const voice=voices.find(item=>item.lang.toLowerCase()===language.toLowerCase())
      ?? voices.find(item=>item.lang.toLowerCase().startsWith(language.slice(0,2).toLowerCase()+'-'));
    // If the browser lists voices and none match, do not read sensitive content in a wrong language.
    if(voices.length>0&&!voice){onState('voice-unavailable');return false;}
    const ticket=generation;
    try {
      const utterance=new scope!.SpeechSynthesisUtterance!(text.slice(0,1200));
      utterance.lang=language;
      utterance.rate=0.96;
      if(voice) utterance.voice=voice;
      utterance.onend=()=>{if(ticket===generation)onState('idle');};
      utterance.onerror=()=>{if(ticket===generation)onState('synthesis-error');};
      synth.speak(utterance);
      onState('speaking');
      return true;
    }catch{onState('synthesis-error');return false;}
  }

  return {start,speak,stop,support:()=>browserVoiceSupport(scope)};
}
