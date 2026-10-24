import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { answerQuestion, assistantCopy, assistantLocales, type AssistantAnswer, type AssistantLocale, type Topic } from '../lib/public-assistant';
import '../styles/public-assistant.css';

type Turn = {question:string;answer:AssistantAnswer};
export default function PublicAssistant(props: {locale?:AssistantLocale}) {
  const [locale,setLocale]=createSignal<AssistantLocale>(props.locale ?? 'de');
  const [question,setQuestion]=createSignal('');
  const [turns,setTurns]=createSignal<Turn[]>([]);
  const [error,setError]=createSignal('');
  const [ready,setReady]=createSignal(false);
  const t=createMemo(()=>assistantCopy[locale()]);
  let input:HTMLInputElement|undefined;
  let latest:HTMLDivElement|undefined;
  onMount(()=>{
    const requested=new URLSearchParams(location.search).get('lang');
    const language=requested ?? document.documentElement.lang;
    if(assistantLocales.includes(language as AssistantLocale))setLocale(language as AssistantLocale);
    setReady(true);
  });
  function reset(){setTurns([]);setQuestion('');setError('');input?.focus();}
  function changeLanguage(value:AssistantLocale){setLocale(value);reset();}
  function send(text=question(),topic?:Topic){
    if(!text.trim()||text.length>500){setError(t().limit);input?.focus();return;}
    setTurns(previous=>[...previous.slice(-19),{question:text.trim(),answer:answerQuestion(text,locale(),topic)}]);
    setQuestion('');setError('');input?.focus();
    requestAnimationFrame(()=>latest?.scrollIntoView({block:'nearest',behavior:'instant'}));
  }
  return <section class="knaba-assistant" lang={locale()} aria-label={t().title}>
    <header class="assistant-header"><div><span class="assistant-mark" aria-hidden="true">✳</span><strong>{t().title}</strong></div><label><span class="sr-only">{t().language}</span><select aria-label={t().language} value={locale()} onChange={e=>changeLanguage(e.currentTarget.value as AssistantLocale)}><option value="de" selected={locale()==='de'}>Deutsch</option><option value="en" selected={locale()==='en'}>English</option><option value="uk" selected={locale()==='uk'}>Українська</option><option value="ru" selected={locale()==='ru'}>Русский</option></select></label></header>
    <div class="assistant-body"><p class="assistant-mode">{t().mode}</p><h2>{t().intro}</h2><p>{t().greeting}</p>
      <div class="assistant-topics"><For each={Object.entries(t().topics) as [Topic,string][]}>{([topic,label])=><button type="button" disabled={!ready()} onClick={()=>send(label,topic)}>{label} <span aria-hidden="true">↗</span></button>}</For></div>
      <div class="assistant-history" role="log" aria-label={t().title} aria-live="polite" aria-relevant="additions"><For each={turns()}>{turn=><div class="assistant-turn"><p class="assistant-question"><strong>{t().you}</strong><span>{turn.question}</span></p><div class="assistant-answer"><strong>{t().title}</strong><p>{turn.answer.text}</p><div class="assistant-links"><For each={turn.answer.links}>{link=><a href={link.href}>{link.label} <span aria-hidden="true">↗</span></a>}</For></div></div></div>}</For><div ref={latest}/></div>
      <form class="assistant-form" onSubmit={event=>{event.preventDefault();send();}}><label for="assistant-question">{t().question}</label><div><input ref={input} id="assistant-question" type="text" maxLength={500} value={question()} disabled={!ready()} autocomplete="off" aria-invalid={!!error()} aria-describedby="assistant-privacy assistant-error" onInput={e=>{setQuestion(e.currentTarget.value);setError('');}}/><button type="submit" class="button button-dark" disabled={!ready()||!question().trim()}>{t().send} <span aria-hidden="true">↑</span></button></div><p id="assistant-error" role="alert">{error()}</p></form>
      <p id="assistant-privacy" class="assistant-privacy">{t().privacy}</p><Show when={turns().length}><button class="assistant-reset" type="button" onClick={reset}>{t().clear}</button></Show>
    </div>
  </section>;
}
