import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { publicText, publicApiError, publicOfferName, localizedService, type PublicLocale } from "../lib/public-i18n";
import { createRequestId } from "../lib/request-id";
import { portalHeader } from "../lib/portal-contract";
import { company,services } from "../data/company";
import { constructionOffers, offerBySlug } from "../data/construction-offers";
import { constructionInquiryData, constructionMessageLimit, validateConstructionInquiry } from "../lib/inquiry-construction";
import { inquirySupportPath } from "../lib/inquiry-navigation";
import { inquiryDraftCopy, inquiryDraftMemory } from "../lib/inquiry-draft";
import {assistantTickets} from "../lib/assistant-ticket";
import {assistantInquiryAction,fetchAssistantRequestLabels,type AssistantRequestLabels} from "../lib/assistant-request-copy";
import {INBOX_LOCALE_NAMES} from "../lib/assistant-inbox-i18n";
import type {AssistantTicket} from "../lib/assistant-recovery";
import {mergeAssistantRequests,type AssistantRequestContext,type AssistantRequestSummary,type AssistantRequestReceipt,type AssistantRequestResult} from "../lib/assistant-request-contract";
import {
  buildInquiry,
  emptyInquiry,
  frequencies,
  inquiryLimits,
  objectTypes,
} from "../lib/inquiry";
import type { InquiryData } from "../lib/inquiry";

export default function Inquiry(props: { locale?: PublicLocale } = {}) {
  const locale = () => props.locale ?? "de";
  const t = (text: string) => publicText(text, locale());
  const supportLabel = (text: string) => t(text) + (["en", "pl", "lt", "uk"].includes(locale()) ? " (DE)" : "");
  const path = (value: '/datenschutz/' | '/konto/') => inquirySupportPath(value, locale());
  const [topic, setTopic] = createSignal("");
  const requestData = () => constructionInquiryData(data(), topic(), locale());
  const serviceGroup=()=>{const service=services.find(item=>item.slug===data().service);return service?localizedService(service,locale()).name:'';};
  const messageLimit = () => constructionMessageLimit(topic(), locale());
  const [step, setStep] = createSignal(0);
  const [ready, setReady] = createSignal(false);
  const [data, setData] = createSignal<InquiryData>(emptyInquiry());
  const [review, setReview] = createSignal<ReturnType<
    typeof buildInquiry
  > | null>(null);
  const [status, setStatus] = createSignal("");
  const [privacy, setPrivacy] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [receipt, setReceipt] = createSignal("");
  const [website, setWebsite] = createSignal("");
  const [dirty, setDirty] = createSignal(false);
  const [draftNotice, setDraftNotice] = createSignal("");
  let entryTopic = "";
  let activeRequest: AbortController | null = null;
  const [assistantMode,setAssistantMode]=createSignal(false),[assistantLabels,setAssistantLabels]=createSignal<AssistantRequestLabels|null>(null);
  const [assistantContext,setAssistantContext]=createSignal<AssistantRequestContext|null>(null),[contextBusy,setContextBusy]=createSignal(false);
  const [assistantFault,setAssistantFault]=createSignal<'unavailable'|'load'|''>(''),[transferAccepted,setTransferAccepted]=createSignal(false);
  let contextRequest:AbortController|null=null,capturedTicket:AssistantTicket|null=null,capCurrent=()=>false,disposed=false,prefilled=false;
  let viewGeneration=0,observedLocale=locale();
  let draftMemory:Omit<typeof inquiryDraftMemory,'forAssistant'|'forgetAssistant'>|null=null;
  const [error, setError] = createSignal("");
  const [invalidField, setInvalidField] = createSignal<
    keyof InquiryData | null
  >(null);
  let heading: HTMLHeadingElement | undefined;
  let summary: HTMLTextAreaElement | undefined;
  const labels = () => [t("Leistung"), t("Objekt"), t("Kontakt")];
  const fieldSteps: Record<keyof InquiryData, number> = {
    service: 0,
    objectType: 1,
    postcode: 1,
    area: 1,
    frequency: 1,
    name: 2,
    email: 2,
    phone: 2,
    message: 2,
  };

  function descriptionFor(field: keyof InquiryData, hint?: string) {
    return (
      [hint, invalidField() === field ? "inquiry-error" : undefined]
        .filter(Boolean)
        .join(" ") || undefined
    );
  }

  function showFieldError(field: keyof InquiryData, message: string) {
    setStep(fieldSteps[field]);
    setInvalidField(field);
    setError(message);
    queueMicrotask(() =>
      document
        .getElementById(`inquiry-${field === "objectType" ? "object" : field}`)
        ?.focus(),
    );
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const assistant=params.get('intent')==='assistant';setAssistantMode(assistant);
    if(assistant){
      capturedTicket=assistantTickets.captured();
      if(capturedTicket){capCurrent=assistantTickets.checkpoint(capturedTicket);draftMemory=inquiryDraftMemory.forAssistant(capturedTicket,capCurrent);}
      else setAssistantFault('unavailable');
    }else draftMemory=inquiryDraftMemory;
    const saved = draftMemory?.read();
    const navigationTopic = draftMemory?.takeNavigationTopic();
    if (saved) {
      setData(saved.data);
      setTopic(saved.topic);
      setStep([0, 1, 2].includes(saved.step) ? saved.step : 0);
      setDirty(true);
      setDraftNotice(inquiryDraftCopy[locale()].restored);
      prefilled=true;
      if (saved.reviewing) {
        try { setReview(buildInquiry(requestData(), locale(), topic())); }
        catch { setStep(2); }
      }
    }
    const selected = assistant?undefined:offerBySlug(params.get("anliegen") || "")
      ?? (params.get("leistung") === "baureinigung" ? offerBySlug("baureinigung") : undefined);
    entryTopic = selected?.slug ?? "";
    const explicitSelection = !saved || navigationTopic === selected?.slug
      || (navigationTopic === undefined && selected?.slug !== saved.entryTopic);
    if (selected && selected.slug !== topic() && explicitSelection) {
      selectTopic(selected.slug);
      setReview(null);
      setStep(0);
    }
    draftMemory?.connectNavigation(document, window);
    const unsubscribe=assistant?assistantTickets.subscribe(()=>{if(!capCurrent())invalidateAssistant();}):()=>{};
    if(assistant)void initializeAssistant();else setReady(true);
    onCleanup(() => {
      saveDraft();
      disposed=true;unsubscribe();draftMemory?.releaseIfEmpty();
      activeRequest?.abort();
      activeRequest = null;
      contextRequest?.abort();contextRequest=null;
    });
  });

  function saveDraft() {
    if (!ready()||!draftMemory||(assistantMode()&&!capCurrent())) return;
    if (receipt()) { draftMemory.clear(); return; }
    if (dirty()) draftMemory.save({data: data(), topic: topic(), step: step(), reviewing: !!review(), entryTopic});
  }

  createEffect(() => {
    if (!ready()) return;
    saveDraft();
  });
  createEffect(()=>{
    const selected=locale();if(selected===observedLocale)return;observedLocale=selected;viewGeneration++;
    setPrivacy(false);setTransferAccepted(false);
    if(assistantMode()){
      activeRequest?.abort();activeRequest=null;contextRequest?.abort();contextRequest=null;
      setSending(false);setContextBusy(false);setReady(false);setAssistantLabels(null);
      void initializeAssistant();
    }
  });

  function selectTopic(value: string) {
    const offer = offerBySlug(value);
    if ((offer?.slug ?? "") !== topic()) {
      draftMemory?.resetSubmission();
      if (ready()) setDirty(true);
    }
    setTopic(offer?.slug ?? "");
    update("service", offer ? "baureinigung" : "");
    if (offer && !data().objectType) update("objectType", "Baustelle");
  }

  function update(field: keyof InquiryData, value: string) {
    if (data()[field] !== value) {
      draftMemory?.resetSubmission();
      if(assistantMode())setTransferAccepted(false);
      if (ready()) { setDirty(true); setDraftNotice(""); }
    }
    setData((previous) => ({ ...previous, [field]: value }));
    if (invalidField() === field) {
      setInvalidField(null);
      setError("");
    }
  }

  function viewCheckpoint(){
    const startedLocale=locale(),startedTicket=capturedTicket,current=capCurrent,generation=viewGeneration;
    return ()=>!disposed&&viewGeneration===generation&&locale()===startedLocale&&(!assistantMode()||(capturedTicket===startedTicket&&!!startedTicket&&current()));
  }
  function invalidateAssistant(){
    viewGeneration++;
    if(capturedTicket)inquiryDraftMemory.forgetAssistant(capturedTicket);
    capturedTicket=null;capCurrent=()=>false;draftMemory=null;
    activeRequest?.abort();activeRequest=null;contextRequest?.abort();contextRequest=null;
    setReady(false);setSending(false);setContextBusy(false);setAssistantContext(null);setAssistantFault('unavailable');
    setData(emptyInquiry());setTopic('');setStep(0);setReview(null);setReceipt('');setPrivacy(false);setTransferAccepted(false);
    setDirty(false);setDraftNotice('');setError('');setStatus('');
  }
  function expireAssistant(problem:unknown){
    if((problem as {status?:number})?.status!==404)return false;
    if(capCurrent())assistantTickets.write(null);
    invalidateAssistant();return true;
  }
  async function initializeAssistant(){
    const selected=locale(),generation=viewGeneration;
    try{
      const copy=await fetchAssistantRequestLabels(selected);
      if(disposed||viewGeneration!==generation||locale()!==selected)return;
      setAssistantLabels(copy);
      if(!capturedTicket||!capCurrent()){invalidateAssistant();return;}
      await refreshAssistant();
    }catch{if(!disposed&&viewGeneration===generation&&locale()===selected)setAssistantFault('load');}
  }
  async function guestCall<T>(suffix:string,method:string,body:unknown,controller:AbortController):Promise<T>{
    const current=viewCheckpoint(),ticket=capturedTicket;
    const check=()=>{if(!ticket||!current()||controller.signal.aborted)throw new DOMException('Request context changed','AbortError');};
    check();
    const response=await fetch(`/api/assistant/conversations/${ticket!.id}${suffix}`,{
      method,credentials:'same-origin',cache:'no-store',signal:controller.signal,
      headers:{'Content-Type':'application/json',...portalHeader,'X-KnaBa-Conversation':ticket!.token},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    check();
    if(!response.ok)throw Object.assign(new Error('Assistant request failed'),{status:response.status});
    const result=await response.json();check();
    if((result?.conversation?.id??result?.conversationId)!==ticket!.id)throw Error('Unexpected conversation receipt');
    return result as T;
  }
  async function refreshAssistant(more=false){
    if(contextBusy()||sending()||disposed)return;
    if(!assistantLabels()){await initializeAssistant();return;}
    if(!capturedTicket||!capCurrent()){invalidateAssistant();return;}
    const cursor=more?assistantContext()?.requestPage.nextCursor:null;
    if(more&&!cursor)return;
    const controller=new AbortController(),current=viewCheckpoint();contextRequest=controller;setContextBusy(true);setAssistantFault('');
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const result=await guestCall<AssistantRequestContext>('/request-context'+(cursor?'?requestCursor='+encodeURIComponent(cursor):''),'GET',undefined,controller);
      if(contextRequest!==controller||!current()||controller.signal.aborted)return;
      if(!Array.isArray(result.requests)||result.requestPage?.limit!==20||!Number.isSafeInteger(result.requestPage.total)||result.requestPage.total<0)throw Error('Invalid request page');
      const requests=more?mergeAssistantRequests([...(assistantContext()?.requests??[]),...result.requests]):result.requests;
      setAssistantContext({...result,requests});setReady(true);
      if(!prefilled){
        prefilled=true;setData(previous=>({...previous,name:result.conversation.contactName,email:result.conversation.contactEmail,phone:result.conversation.contactPhone}));
      }
    }catch(problem){if(contextRequest===controller&&current()&&!expireAssistant(problem))setAssistantFault('load');}
    finally{clearTimeout(timer);if(contextRequest===controller){contextRequest=null;setContextBusy(false);}}
  }
  async function cancelAssistantRequest(request:AssistantRequestSummary){
    const copy=assistantLabels();
    if(!copy||sending()||contextBusy()||!viewCheckpoint()()||!['new','reviewing'].includes(request.status)||!window.confirm(copy.requestCancelConfirm))return;
    const controller=new AbortController(),current=viewCheckpoint();activeRequest=controller;setSending(true);setError('');
    const timer=setTimeout(()=>controller.abort(),15000);let conflict=false,changed=false;
    try{
      const result=await guestCall<AssistantRequestResult>(`/requests/${request.id}/cancel`,'POST',{version:request.version},controller);
      if(activeRequest!==controller||!current()||controller.signal.aborted)return;
      if(result.request?.id!==request.id)throw Error('Unexpected cancellation receipt');
      setAssistantContext(value=>value?{...value,requests:value.requests.map(item=>item.id===request.id?result.request:item)}:value);changed=true;
    }catch(problem){
      if(activeRequest===controller&&current()&&!expireAssistant(problem)){
        conflict=(problem as {status?:number})?.status===409;
        if(!conflict)setError(copy.requestError);
      }
    }finally{clearTimeout(timer);if(activeRequest===controller){activeRequest=null;setSending(false);}}
    if(current()&&(conflict||changed)){await refreshAssistant();if(current()&&conflict)setError(copy.requestChanged);}
  }

  function move(next: number) {
    setStep(next);
    setError("");
    setInvalidField(null);
    setStatus("");
    queueMicrotask(() => heading?.focus());
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if(!ready()||!viewCheckpoint()())return;
    const form = event.currentTarget as HTMLFormElement;
    if (!form.reportValidity()) return;
    if (step() < 2) {
      const relevant: (keyof InquiryData)[] =
        step() === 0
          ? ["service"]
          : ["objectType", "postcode", "area", "frequency"];
      const issues = validateConstructionInquiry(data(), topic(), locale());
      const first = relevant.find((field) => issues[field]);
      if (first) {
        showFieldError(
          first,
          issues[first] || t("Bitte prüfen Sie Ihre Angaben."),
        );
        return;
      }
      move(step() + 1);
      return;
    }
    const issues = validateConstructionInquiry(data(), topic(), locale());
    const first = (Object.keys(issues) as (keyof InquiryData)[])[0];
    if (first) {
      showFieldError(first, issues[first] || t("Bitte prüfen Sie Ihre Angaben."));
      return;
    }
    try {
      setReview(buildInquiry(requestData(), locale(), topic()));
      setError("");
      setInvalidField(null);
      setStatus("");
      queueMicrotask(() => heading?.focus());
    } catch (cause) {
      showFieldError(
        "message",
        cause instanceof Error
          ? cause.message
          : t("Bitte prüfen Sie Ihre Angaben."),
      );
    }
  }

  async function sendRequest() {
    if (sending() || receipt() || !ready() || !draftMemory || !viewCheckpoint()()) return;
    if(assistantMode()&&(contextBusy()||assistantContext()?.conversation.status==='closed'))return;
    if (!privacy()) { setError(t("Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.")); return; }
    if(assistantMode()&&!transferAccepted()){setError(assistantLabels()!.requestNeedConsent);return;}
    setSending(true); setError(""); setStatus("");
    const controller = new AbortController();
    const current=viewCheckpoint();let refreshAfter=false;
    activeRequest = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const submission = draftMemory.prepareSubmission(requestData(), website(), createRequestId);
      let result;
      if(assistantMode()){
        result=await guestCall<AssistantRequestReceipt>('/requests','POST',submission,controller);
        if(result.request?.id!==result.id)throw Error('Unexpected request receipt');
        refreshAfter=true;
      }else{
        const response = await fetch("/api/leads", {
          method: "POST", headers: {"Content-Type":"application/json", ...portalHeader},
          body: JSON.stringify(submission),signal:controller.signal,
        });
        if(activeRequest!==controller||!current()||controller.signal.aborted)return;
        result=await response.json();
        if (!response.ok) throw new Error(publicApiError(result.error?.code, locale(), result.error?.message || t("Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.")));
      }
      if (activeRequest !== controller || !current() || controller.signal.aborted) return;
      if (!result.received || typeof result.id !== "string") throw new Error(t("Die Eingangsbestätigung fehlt. Bitte versuchen Sie es erneut."));
      setReceipt(result.id);
      setDirty(false);
      draftMemory!.clear();
      setStatus(t("Ihre Anfrage ist bei KnaBa eingegangen. Dies ist noch keine Termin- oder Auftragsbestätigung."));
      queueMicrotask(() => heading?.focus());
    } catch (cause) {
      if (activeRequest !== controller || !current()) return;
      if(assistantMode()){
        if(expireAssistant(cause))return;
        refreshAfter=(cause as {status?:number})?.status===409;
        setError(assistantLabels()!.requestError);
      }else setError(cause instanceof Error && cause.name !== "AbortError" ? (locale() === "ru" && (cause instanceof TypeError || cause instanceof SyntaxError) ? t("Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.") : t(cause.message)) : t("Die Verbindung hat zu lange gedauert. Sie können mit derselben Anfrage erneut versuchen oder uns direkt kontaktieren."));
    } finally {
      clearTimeout(timer);
      if (activeRequest === controller) { activeRequest = null; setSending(false); }
    }
    if(refreshAfter&&current())await refreshAssistant();
  }

  async function copySummary() {
    const current = review();
    if (!current) return;
    const stillCurrent=viewCheckpoint();
    if(!stillCurrent())return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(
        `${t("An")}: ${company.email}\n${t("Betreff")}: ${current.subject}\n\n${current.body}`,
      );
      if(!stillCurrent())return;
      setStatus(
        t("Anfrage kopiert. Fügen Sie den Text in eine E-Mail an kontakt@knaba.de ein. Noch nicht gesendet."),
      );
    } catch {
      if(!stillCurrent())return;
      summary?.focus();
      summary?.select();
      setStatus(
        t("Automatisches Kopieren ist hier nicht verfügbar. Der Text ist markiert: Bitte kopieren Sie ihn über das Menü Ihres Geräts."),
      );
    }
  }

  return (
    <section class="wizard" aria-label={t("Projektanfrage")} aria-busy={sending()||contextBusy()} data-knaba-dirty={!receipt() && Object.values(data()).some(value => value.trim()) ? 'true' : undefined}>
      <Show when={assistantMode()}>
        <h2>{assistantLabels()?.requestHeading??assistantInquiryAction[locale()]}</h2>
        <Show when={assistantLabels()}>{copy=><>
          <p class="field-hint">{copy().requestLocalOnly}</p>
          <Show when={assistantFault()}><p class="form-status" role="alert">{assistantFault()==='unavailable'?copy().requestUnavailable:copy().requestLoadError}</p></Show>
          <Show when={contextBusy()}><p class="form-status" role="status">{copy().requestLoading}</p></Show>
          <Show when={assistantContext()}>{context=><>
            <Show when={context().conversation.status==='closed'}><p class="form-status" role="status">{copy().requestClosed}</p></Show>
            <For each={context().requests}>{request=><article class="receipt-card" data-assistant-request={request.id}>
              <strong><code>{request.id}</code></strong>
              <p>{copy().requestSiteStatus}: {copy()[`request_${request.status}`]}</p>
              <p>{copy().requestERPStatus}: {copy()[`transfer_${request.erpTransfer.status}`]}</p>
              <Show when={request.status==='new'||request.status==='reviewing'}><button type="button" class="button button-outline" disabled={sending()||contextBusy()} onClick={()=>void cancelAssistantRequest(request)}>{copy().requestCancel}</button></Show>
            </article>}</For>
            <p class="field-hint">{copy().requestCount.replace('{loaded}',String(context().requests.length)).replace('{total}',String(context().requestPage.total))}</p>
            <p class="field-hint">{copy().requestCancelBoundary}</p>
          </>}</Show>
          <div class="wizard-actions">
            <button type="button" class="button button-outline" disabled={sending()||contextBusy()||assistantFault()==='unavailable'} onClick={()=>void refreshAssistant()}>{copy().requestRefresh}</button>
            <Show when={assistantContext()?.requestPage.nextCursor}><button type="button" class="button button-outline" disabled={sending()||contextBusy()} onClick={()=>void refreshAssistant(true)}>{copy().requestMore}</button></Show>
          </div>
          <Show when={error()}><p class="form-status" role="alert">{error()}</p></Show>
        </>}</Show>
        <Show when={!assistantLabels()&&assistantFault()==='load'}><p class="form-status" role="alert">{t('Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.')}</p><button type="button" class="button button-outline" onClick={()=>void initializeAssistant()}>{assistantInquiryAction[locale()]}</button></Show>
      </Show>
      <Show when={!assistantMode()||(ready()&&assistantContext()?.conversation.status!=='closed')}>
      <ol class="wizard-progress" aria-label={t("Schritte der Anfrage")}>
        <For each={labels()}>
          {(label, index) => (
            <li
              aria-current={
                !review() && index() === step() ? "step" : undefined
              }
              class={index() < step() || review() ? "completed" : ""}
            >
              <span>{index() + 1}</span>
              {label}
            </li>
          )}
        </For>
      </ol>
      <h2 ref={heading} tabIndex={-1}>
        {review()
          ? receipt() ? t("Vielen Dank für Ihre Anfrage.") : t("Ihre Anfrage im Überblick.")
          : [
              t("Welche Leistung benötigen Sie?"),
              t("Erzählen Sie uns von Ihrem Objekt."),
              t("Wie können wir Sie erreichen?"),
            ][step()]}
      </h2>
      <Show when={draftNotice()}><p class="form-status" role="status" aria-live="polite">{draftNotice()}</p></Show>
      <Show
        when={!review()}
        fallback={
          <>
            <Show when={receipt()} fallback={<p class="form-status">{t("Bitte prüfen Sie Ihre Angaben. Mit „Anfrage senden“ übermitteln Sie diese direkt an KnaBa.")}</p>}>
              <div class="receipt-card" role="status"><strong>{t("Anfrage eingegangen")}</strong><p>{t("Ihre Vorgangsnummer:")} <code>{receipt()}</code></p><p>{t("Wir prüfen Ihren Bedarf. Ein Termin und ein Auftrag entstehen erst nach persönlicher Vereinbarung.")}</p></div>
            </Show>
            <div class="review-summary">
              <label for="inquiry-summary">
                {t("Ihre Angaben zum Prüfen und Kopieren")}
              </label>
              <textarea
                id="inquiry-summary"
                ref={summary}
                readOnly
                rows={16}
                value={review()?.body || ""}
              />
            </div>
            <Show when={!assistantMode()}><p class="field-hint">
              {t("Empfänger:")} <a href={`mailto:${company.email}`}>{company.email}</a>
              {t(". Alternativ können Sie Ihre Anfrage telefonisch oder per E-Mail besprechen.")}
            </p></Show>
            <Show when={!receipt()}>
              <label class="privacy-check"><input type="checkbox" checked={privacy()} onChange={event => setPrivacy(event.currentTarget.checked)} /> <span>{t("Ich habe die")} <a href={path("/datenschutz/")} data-astro-reload>{supportLabel("Datenschutzhinweise")}</a> {t("gelesen. Meine Angaben werden zur Bearbeitung der Anfrage gespeichert.")}</span></label>
              <Show when={assistantMode()&&assistantLabels()}>{copy=><>
                <p id="inquiry-transfer-fields" class="field-hint">{copy().requestFields} {copy().requestLocalOnly} {copy().requestServiceGroup}: {serviceGroup()}. {copy().requestLanguage}: {INBOX_LOCALE_NAMES[assistantContext()!.conversation.locale]}.</p>
                <label class="privacy-check"><input id="inquiry-transfer-consent" type="checkbox" checked={transferAccepted()} aria-describedby="inquiry-transfer-fields" onChange={event=>setTransferAccepted(event.currentTarget.checked)}/><span>{copy().requestTransferConsent}</span></label>
              </>}</Show>
            </Show>
            <p class="form-status" role="alert">{error()}</p>
            <div class="wizard-actions">
              <Show when={!receipt()}><button class="button button-dark" type="button" onClick={sendRequest} disabled={sending() || !privacy() || (assistantMode()&&(!transferAccepted()||contextBusy()))}>{sending() ? t("Wird gesendet …") : t("Anfrage senden →")}</button>
              <button
                type="button"
                class="button button-outline"
                disabled={sending()}
                onClick={() => {
                  setReview(null);
                  move(2);
                }}
              >
                {t("Angaben bearbeiten")}
              </button></Show>
              <Show when={receipt()&&!assistantMode()}><a class="button button-dark" href={path("/konto/")}>{t("Zum Kundenportal →")}</a></Show>
              <Show when={!assistantMode()}><a class="button button-dark" href={review()?.href}>
                {t("Im E-Mail-Programm öffnen ↗")}
              </a></Show>
              <button
                type="button"
                class="button button-outline"
                onClick={copySummary}
              >
                {t("Anfrage kopieren")}
              </button>
            </div>
            <p class="form-status" role="status" aria-live="polite">
              {status()}
            </p>
          </>
        }
      >
        <form onSubmit={submit} noValidate>
          <fieldset disabled={!ready()}>
            <legend class="sr-only">{labels()[step()]}</legend>
            <div class="honey-field" aria-hidden="true"><label for="inquiry-website">Website<input id="inquiry-website" name="website" tabindex="-1" autocomplete="off" value={website()} onInput={event=>setWebsite(event.currentTarget.value)} /></label></div>
            <Show when={step() === 0}>
              <div class="field field-full">
                <label for="inquiry-service">
                  {t("Gewünschte Leistung")} <span aria-hidden="true">*</span>
                </label>
                <select
                  id="inquiry-service"
                  name="service"
                  aria-invalid={invalidField() === "service" ? true : undefined}
                  aria-describedby={descriptionFor("service")}
                  value={topic()}
                  onChange={(event) =>
                    selectTopic(event.currentTarget.value)
                  }
                  required
                >
                  <option value="">{t("Bitte auswählen")}</option>
                  <For each={constructionOffers}>
                    {(service) => (
                      <option value={service.slug}>{publicOfferName(service,locale())}</option>
                    )}
                  </For>
                </select>
                <p class="field-hint">
                  {t("Wählen Sie die Leistung, die am besten zu Ihrem Bedarf passt. Weitere Wünsche können Sie im letzten Schritt ergänzen.")}
                </p>
              </div>
            </Show>
            <Show when={step() === 1}>
              <div class="form-grid">
                <div class="field field-full">
                  <label for="inquiry-object">
                    {t("Objektart")} <span aria-hidden="true">*</span>
                  </label>
                  <select
                    id="inquiry-object"
                    name="objectType"
                    aria-invalid={
                      invalidField() === "objectType" ? true : undefined
                    }
                    aria-describedby={descriptionFor("objectType")}
                    required
                    value={data().objectType}
                    onChange={(event) =>
                      update("objectType", event.currentTarget.value)
                    }
                  >
                    <option value="">{t("Bitte auswählen")}</option>
                    <For each={objectTypes.filter(type => type === "Baustelle" || type === "Anderes Objekt")}>
                      {(type) => <option value={type}>{t(type)}</option>}
                    </For>
                  </select>
                </div>
                <div class="field">
                  <label for="inquiry-postcode">
                    {t("Postleitzahl des Objekts")} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="inquiry-postcode"
                    name="postcode"
                    aria-invalid={
                      invalidField() === "postcode" ? true : undefined
                    }
                    type="text"
                    inputMode="numeric"
                    autocomplete="postal-code"
                    pattern="[0-9]{5}"
                    maxLength={5}
                    required
                    value={data().postcode}
                    onInput={(event) =>
                      update("postcode", event.currentTarget.value)
                    }
                    aria-describedby={descriptionFor(
                      "postcode",
                      "postcode-hint",
                    )}
                  />
                  <span id="postcode-hint" class="field-hint">
                    {t("Fünf Ziffern, z. B. 10315.")}
                  </span>
                </div>
                <div class="field">
                  <label for="inquiry-area">
                    {t("Fläche in m²")} <span>{t("(optional)")}</span>
                  </label>
                  <input
                    id="inquiry-area"
                    name="area"
                    aria-invalid={invalidField() === "area" ? true : undefined}
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    value={data().area}
                    onInput={(event) =>
                      update("area", event.currentTarget.value)
                    }
                    aria-describedby={descriptionFor("area", "area-hint")}
                  />
                  <span id="area-hint" class="field-hint">
                    {t("Eine Schätzung genügt.")}
                  </span>
                </div>
                <div class="field field-full">
                  <label for="inquiry-frequency">
                    {t("Häufigkeit")} <span aria-hidden="true">*</span>
                  </label>
                  <select
                    id="inquiry-frequency"
                    name="frequency"
                    aria-invalid={
                      invalidField() === "frequency" ? true : undefined
                    }
                    aria-describedby={descriptionFor("frequency")}
                    required
                    value={data().frequency}
                    onChange={(event) =>
                      update("frequency", event.currentTarget.value)
                    }
                  >
                    <option value="">{t("Bitte auswählen")}</option>
                    <For each={frequencies}>
                      {(frequency) => (
                        <option value={frequency}>{t(frequency)}</option>
                      )}
                    </For>
                  </select>
                </div>
              </div>
            </Show>
            <Show when={step() === 2}>
              <div class="form-grid">
                <div class="field field-full">
                  <label for="inquiry-name">
                    {t("Ihr Name")} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="inquiry-name"
                    name="name"
                    aria-invalid={invalidField() === "name" ? true : undefined}
                    aria-describedby={descriptionFor("name")}
                    autocomplete="name"
                    required
                    maxLength={inquiryLimits.name}
                    value={data().name}
                    onInput={(event) =>
                      update("name", event.currentTarget.value)
                    }
                  />
                </div>
                <div class="field">
                  <label for="inquiry-email">
                    {t("E-Mail")} <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="inquiry-email"
                    name="email"
                    aria-invalid={invalidField() === "email" ? true : undefined}
                    aria-describedby={descriptionFor("email")}
                    type="email"
                    autocomplete="email"
                    required
                    maxLength={inquiryLimits.email}
                    value={data().email}
                    onInput={(event) =>
                      update("email", event.currentTarget.value)
                    }
                  />
                </div>
                <div class="field">
                  <label for="inquiry-phone">
                    {t("Telefon")} <span>{t("(optional)")}</span>
                  </label>
                  <input
                    id="inquiry-phone"
                    name="phone"
                    aria-invalid={invalidField() === "phone" ? true : undefined}
                    aria-describedby={descriptionFor("phone")}
                    type="tel"
                    autocomplete="tel"
                    maxLength={inquiryLimits.phone}
                    value={data().phone}
                    onInput={(event) =>
                      update("phone", event.currentTarget.value)
                    }
                  />
                </div>
                <div class="field field-full">
                  <label for="inquiry-message">
                    {t("Ihre Nachricht")} <span>{t("(optional)")}</span>
                  </label>
                  <textarea
                    id="inquiry-message"
                    name="message"
                    aria-invalid={
                      invalidField() === "message" ? true : undefined
                    }
                    aria-describedby={descriptionFor("message")}
                    rows={4}
                    maxLength={messageLimit()}
                    value={data().message}
                    onInput={(event) =>
                      update("message", event.currentTarget.value)
                    }
                    placeholder={t("Zum Beispiel Wunschtermin, Zugangszeiten oder besondere Anforderungen.")}
                  />
                  <span class="field-hint">
                    {data().message.length} / {messageLimit()} {t("Zeichen. Bitte keine sensiblen Daten eintragen.")}
                  </span>
                </div>
              </div>
              <p class="field-hint">
                {t("Im nächsten Schritt prüfen Sie Ihre Anfrage und senden sie direkt an KnaBa. Eine Registrierung ist dafür nicht erforderlich. Informationen zur Verarbeitung finden Sie unter")}{" "}
                <a href={path("/datenschutz/")}>{supportLabel("Datenschutz")}</a>.
              </p>
            </Show>
          </fieldset>
          <p id="inquiry-error" class="form-status" role="alert">
            {error()}
          </p>
          <div class="wizard-actions">
            <Show when={step() > 0}>
              <button
                type="button"
                class="button button-outline"
                onClick={() => move(step() - 1)}
              >
                {t("← Zurück")}
              </button>
            </Show>
            <button class="button button-dark" type="submit" disabled={!ready()}>
              {step() === 2 ? t("Anfrage prüfen →") : t("Weiter →")}
            </button>
          </div>
          <p class="field-hint">{t("* Pflichtfelder. Noch keine Beauftragung.")}</p>
        </form>
      </Show>
      </Show>
    </section>
  );
}
