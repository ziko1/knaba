import { VisitorOwnerChat } from './OwnerConversation';
import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { answerQuestion, assistantCopy, assistantLocales, type AssistantAnswer, type AssistantLocale, type Topic } from '../lib/public-assistant';
import { routeAssistantQuestion, routeAssistantSelection, type PublicIntent } from '../lib/assistant-routing';
import { createBrowserVoiceController, type VoiceState } from '../lib/assistant-voice';
import '../styles/public-assistant.css';

type Turn = {question:string;answer:AssistantAnswer};
type VoiceText = {start:string;stop:string;replay:string;roles:string;help:string;privacy:string;states:Record<VoiceState,string>;personas:Record<'new_client'|'existing_client'|'worker'|'partner'|'human',string>};
const voiceCopy:Record<AssistantLocale,VoiceText> = {
  de:{
    start:'Gespräch per Mikrofon',stop:'Mikrofon / Stimme stoppen',replay:'Antwort vorlesen',roles:'Wie können wir Ihnen helfen?',help:'Sie sprechen eine Frage und erhalten eine gesprochene Antwort. Für eine Nachricht an KnaBa nutzen Sie separat das Formular unten.',
    privacy:'Sprachfunktionen sind optional. Ihr Browser kann Sprache über Drittanbieter verarbeiten. Das Mikrofon startet nur per Klick. KnaBa speichert hier keine Audioaufnahme; gesprochener Text bleibt im lokalen Informationsdialog, bis Sie selbst eine Nachricht absenden.',
    personas:{new_client:'Neue Anfrage',existing_client:'Bestandskunde',worker:'Mitarbeiter',partner:'Partner',human:'Mit dem Team sprechen'},
    states:{idle:'Bereit für Spracheingabe.',listening:'Mikrofon aktiv. Sprechen Sie jetzt.',speaking:'Antwort wird vorgelesen.',unsupported:'Die Spracherkennung ist in diesem Browser oder Kontext nicht verfügbar. Nutzen Sie bitte das Textfeld.', 'mic-denied':'Kein Mikrofonzugriff. Bitte prüfen Sie die Browserberechtigung.','no-speech':'Keine Sprache erkannt. Versuchen Sie es erneut.','recognition-error':'Die Spracherkennung ist fehlgeschlagen. Nutzen Sie bitte das Textfeld.','voice-unavailable':'Keine installierte Stimme für diese Sprache gefunden.','synthesis-error':'Die Sprachausgabe ist fehlgeschlagen. Lesen Sie die Antwort im Chat.','too-long':'Die erkannte Frage ist zu lang (maximal 500 Zeichen).'},
  },
  en:{
    start:'Talk to the assistant',stop:'Stop mic / speech',replay:'Read answer aloud',roles:'How can we direct you?',help:'Ask a question and hear an answer. To contact KnaBa, separately submit the team message form below.',
    privacy:'Voice is optional. Your browser may process speech using an external provider. The microphone starts only when you click. KnaBa does not store audio here; recognized text stays in the local information chat unless you separately submit a message.',
    personas:{new_client:'New enquiry',existing_client:'Existing customer',worker:'Employee',partner:'Business partner',human:'Speak to the team'},
    states:{idle:'Voice mode ready.',listening:'Microphone active. Please speak.',speaking:'Speaking the answer.',unsupported:'Speech recognition is unavailable in this browser or context. Please use text.', 'mic-denied':'Microphone access was denied. Check your browser permissions.','no-speech':'No speech recognized. Please try again.','recognition-error':'Speech recognition failed. Please use the text field.','voice-unavailable':'No installed voice for this language.','synthesis-error':'Speech playback failed. Please read the chat response.','too-long':'The spoken question is too long (maximum 500 characters).'},
  },
  ru:{
    start:'Поговорить с помощником',stop:'Остановить микрофон / голос',replay:'Озвучить ответ',roles:'Кто вы и с чем обращаетесь?',help:'Задайте вопрос голосом и услышите ответ. Для связи с KnaBa отдельно отправьте сообщение команде в форме ниже.',
    privacy:'Голосовые функции необязательны. Браузер может обрабатывать речь через сторонний сервис. Микрофон включается только после нажатия. KnaBa не сохраняет аудио; распознанный текст остаётся в локальном чате, пока вы отдельно не отправите сообщение.',
    personas:{new_client:'Новый клиент',existing_client:'Наш клиент',worker:'Работник',partner:'Партнёр',human:'Связаться с командой'},
    states:{idle:'Голосовой режим готов.',listening:'Микрофон включён. Говорите.',speaking:'Озвучиваю ответ.',unsupported:'Распознавание речи недоступно в этом браузере или соединении. Используйте текст.', 'mic-denied':'Доступ к микрофону запрещён. Проверьте разрешения браузера.','no-speech':'Речь не распознана. Попробуйте ещё раз.','recognition-error':'Ошибка распознавания речи. Используйте текстовое поле.','voice-unavailable':'Голос для этого языка не установлен.','synthesis-error':'Ошибка озвучивания. Прочитайте ответ в чате.','too-long':'Слишком длинный вопрос (не более 500 символов).'},
  },
  uk:{
    start:'Поговорити з помічником',stop:'Зупинити мікрофон / голос',replay:'Озвучити відповідь',roles:'Хто ви та з яким питанням?',help:'Поставте запитання голосом і прослухайте відповідь. Щоб зв’язатися з KnaBa, окремо надішліть повідомлення команді у формі нижче.',
    privacy:'Голосові функції необов’язкові. Браузер може обробляти мовлення через сторонній сервіс. Мікрофон вмикається тільки після натискання. KnaBa не зберігає аудіо; розпізнаний текст залишається в локальному чаті, доки ви окремо не надішлете повідомлення.',
    personas:{new_client:'Новий клієнт',existing_client:'Наш клієнт',worker:'Працівник',partner:'Партнер',human:'Зв’язатися з командою'},
    states:{idle:'Голосовий режим готовий.',listening:'Мікрофон увімкнено. Говоріть.',speaking:'Озвучую відповідь.',unsupported:'Розпізнавання мовлення недоступне в цьому браузері. Скористайтеся текстом.', 'mic-denied':'Доступ до мікрофона заборонено. Перевірте дозволи браузера.','no-speech':'Мовлення не розпізнано. Спробуйте ще раз.','recognition-error':'Помилка розпізнавання мовлення. Скористайтеся текстом.','voice-unavailable':'Голос для цієї мови не встановлено.','synthesis-error':'Не вдалося озвучити відповідь. Прочитайте її в чаті.','too-long':'Занадто довге запитання (до 500 символів).'},
  },
};
const personaOrder:readonly (keyof VoiceText['personas'])[]=['new_client','existing_client','worker','partner','human'];

export default function PublicAssistant(props: {locale?:AssistantLocale}) {
  const [locale,setLocale]=createSignal<AssistantLocale>(props.locale ?? 'de');
  const [question,setQuestion]=createSignal('');
  const [turns,setTurns]=createSignal<Turn[]>([]);
  const [error,setError]=createSignal('');
  const [ready,setReady]=createSignal(false);
  const [voiceState,setVoiceState]=createSignal<VoiceState>('idle');
  const [voiceReady,setVoiceReady]=createSignal({recognition:false,synthesis:false});
  const t=createMemo(()=>assistantCopy[locale()]);
  const v=createMemo(()=>voiceCopy[locale()]);
  let input:HTMLInputElement|undefined;
  let latest:HTMLDivElement|undefined;
  let voice:ReturnType<typeof createBrowserVoiceController>|undefined;

  onMount(()=>{
    const requested=new URLSearchParams(location.search).get('lang');
    const language=requested ?? document.documentElement.lang;
    if(assistantLocales.includes(language as AssistantLocale))setLocale(language as AssistantLocale);
    voice=createBrowserVoiceController(undefined, transcript=>send(transcript,undefined,true),setVoiceState);
    setVoiceReady(voice.support());
    setReady(true);
  });
  onCleanup(()=>voice?.stop());
  function reset(){voice?.stop();setTurns([]);setQuestion('');setError('');input?.focus();}
  function changeLanguage(value:AssistantLocale){voice?.stop();setLocale(value);reset();}
  function append(questionText:string,answer:AssistantAnswer,spoken=false){
    setTurns(previous=>[...previous.slice(-19),{question:questionText,answer}]);
    setQuestion('');setError('');input?.focus();
    if(spoken)voice?.speak(answer.text,locale());
    requestAnimationFrame(()=>latest?.scrollIntoView({block:'nearest',behavior:'instant'}));
  }
  function send(text=question(),topic?:Topic,spoken=false){
    if(!text.trim()||text.length>500){setError(t().limit);input?.focus();return;}
    // The deterministic public dispatcher never grants a role. Existing FAQ remains the fallback.
    const answer=topic ? answerQuestion(text,locale(),topic) : (routeAssistantQuestion(text,locale())?.answer ?? answerQuestion(text,locale()));
    append(text.trim(),answer,spoken);
  }
  function chooseRole(intent:keyof VoiceText['personas']){
    const answer=routeAssistantSelection(intent as PublicIntent,locale()).answer;
    append(v().personas[intent],answer);
  }
  function toggleMicrophone(){
    if(voiceState()==='listening'||voiceState()==='speaking')voice?.stop();
    else voice?.start(locale());
  }
  return <section class="knaba-assistant" lang={locale()} aria-label={t().title}>
    <header class="assistant-header"><div><span class="assistant-mark" aria-hidden="true">✳</span><strong>{t().title}</strong></div><label><span class="sr-only">{t().language}</span><select aria-label={t().language} value={locale()} onChange={e=>changeLanguage(e.currentTarget.value as AssistantLocale)}><option value="de" selected={locale()==='de'}>Deutsch</option><option value="en" selected={locale()==='en'}>English</option><option value="uk" selected={locale()==='uk'}>Українська</option><option value="ru" selected={locale()==='ru'}>Русский</option></select></label></header>
    <div class="assistant-body"><p class="assistant-mode">{t().mode}</p><h2>{t().intro}</h2><p>{t().greeting}</p>
      <div class="assistant-personas" role="group" aria-label={v().roles}><p class="assistant-section-label">{v().roles}</p><div><For each={personaOrder}>{intent=><button type="button" disabled={!ready()} onClick={()=>chooseRole(intent)}>{v().personas[intent]}</button>}</For></div></div>
      <div class="assistant-voice" role="group" aria-label={v().start}>
        <div class="assistant-voice-controls">
          <button type="button" class="assistant-voice-start" disabled={!ready()||(!voiceReady().recognition&&voiceState()!=='speaking')} aria-pressed={voiceState()==='listening'} onClick={toggleMicrophone}><span aria-hidden="true">🎙</span> {voiceState()==='listening'||voiceState()==='speaking'?v().stop:v().start}</button>
          <button type="button" disabled={!ready()||!voiceReady().synthesis||turns().length===0} onClick={()=>voice?.speak(turns().at(-1)!.answer.text,locale())}>{v().replay}</button>
        </div>
        <p class="assistant-voice-status" role="status" aria-live="polite">{v().states[voiceReady().recognition||voiceState()!=='idle'?voiceState():'unsupported']}</p>
        <p>{v().help}</p><p class="assistant-voice-privacy">{v().privacy}</p>
      </div>
      <div class="assistant-topics"><For each={Object.entries(t().topics) as [Topic,string][]}>{([topic,label])=><button type="button" disabled={!ready()} onClick={()=>send(label,topic)}>{label} <span aria-hidden="true">↗</span></button>}</For></div>
      <div class="assistant-history" role="log" aria-label={t().title} aria-live="polite" aria-relevant="additions"><For each={turns()}>{turn=><div class="assistant-turn"><p class="assistant-question"><strong>{t().you}</strong><span>{turn.question}</span></p><div class="assistant-answer"><strong>{t().title}</strong><p>{turn.answer.text}</p><div class="assistant-links"><For each={turn.answer.links}>{link=><a href={link.href}>{link.label} <span aria-hidden="true">↗</span></a>}</For></div></div></div>}</For><div ref={latest}/></div>
      <form class="assistant-form" onSubmit={event=>{event.preventDefault();send();}}><label for="assistant-question">{t().question}</label><div><input ref={input} id="assistant-question" type="text" maxLength={500} value={question()} disabled={!ready()} autocomplete="off" aria-invalid={!!error()} aria-describedby="assistant-privacy assistant-error" onInput={e=>{setQuestion(e.currentTarget.value);setError('');}}/><button type="submit" class="button button-dark" disabled={!ready()||!question().trim()}>{t().send} <span aria-hidden="true">↑</span></button></div><p id="assistant-error" role="alert">{error()}</p></form>
      <p id="assistant-privacy" class="assistant-privacy">{t().privacy}</p>
      <div id="knaba-owner-chat"><VisitorOwnerChat locale={locale}/></div><Show when={turns().length}><button class="assistant-reset" type="button" onClick={reset}>{t().clear}</button></Show>
    </div>
  </section>;
}
