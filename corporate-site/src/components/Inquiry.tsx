import { For, Show, createSignal, onMount } from "solid-js";
import { publicText, publicApiError, type PublicLocale } from "../lib/public-i18n";
import { createRequestId } from "../lib/request-id";
import { portalHeader } from "../lib/portal-contract";
import { company } from "../data/company";
import { constructionOffers, offerBySlug } from "../data/construction-offers";
import { constructionInquiryData, constructionMessageLimit, validateConstructionInquiry } from "../lib/inquiry-construction";
import { inquirySupportPath } from "../lib/inquiry-navigation";
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
  const supportLabel = (text: string) => t(text) + (["en", "uk"].includes(locale()) ? " (DE)" : "");
  const path = (value: '/datenschutz/' | '/konto/') => inquirySupportPath(value, locale());
  const [topic, setTopic] = createSignal("");
  const requestData = () => constructionInquiryData(data(), topic(), locale());
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
  let idempotencyKey = "";
  const [error, setError] = createSignal("");
  const [invalidField, setInvalidField] = createSignal<
    keyof InquiryData | null
  >(null);
  let heading: HTMLHeadingElement | undefined;
  let summary: HTMLTextAreaElement | undefined;
  const labels = [t("Leistung"), t("Objekt"), t("Kontakt")];
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
    const selected = offerBySlug(params.get("anliegen") || "")
      ?? (params.get("leistung") === "baureinigung" ? offerBySlug("baureinigung") : undefined);
    if (selected) selectTopic(selected.slug);
    setReady(true);
  });

  function selectTopic(value: string) {
    const offer = offerBySlug(value);
    setTopic(offer?.slug ?? "");
    update("service", offer ? "baureinigung" : "");
    if (offer && !data().objectType) update("objectType", "Baustelle");
  }

  function update(field: keyof InquiryData, value: string) {
    idempotencyKey = "";
    setData((previous) => ({ ...previous, [field]: value }));
    if (invalidField() === field) {
      setInvalidField(null);
      setError("");
    }
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
    if (sending() || receipt()) return;
    if (!privacy()) { setError(t("Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben.")); return; }
    setSending(true); setError(""); setStatus("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      idempotencyKey ||= createRequestId();
      const response = await fetch("/api/leads", {
        method: "POST", headers: {"Content-Type":"application/json", ...portalHeader},
        body: JSON.stringify({...requestData(), privacyAccepted:true, website:website(), idempotencyKey}),
        signal:controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(publicApiError(result.error?.code, locale(), result.error?.message || t("Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.")));
      if (!result.received || typeof result.id !== "string") throw new Error(t("Die Eingangsbestätigung fehlt. Bitte versuchen Sie es erneut."));
      setReceipt(result.id);
      setStatus(t("Ihre Anfrage ist bei KnaBa eingegangen. Dies ist noch keine Termin- oder Auftragsbestätigung."));
      queueMicrotask(() => heading?.focus());
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? (locale() === "ru" && (cause instanceof TypeError || cause instanceof SyntaxError) ? t("Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.") : t(cause.message)) : t("Die Verbindung hat zu lange gedauert. Sie können mit derselben Anfrage erneut versuchen oder uns direkt kontaktieren."));
    } finally {clearTimeout(timer);setSending(false);}
  }

  async function copySummary() {
    const current = review();
    if (!current) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(
        `${t("An")}: ${company.email}\n${t("Betreff")}: ${current.subject}\n\n${current.body}`,
      );
      setStatus(
        t("Anfrage kopiert. Fügen Sie den Text in eine E-Mail an kontakt@knaba.de ein. Noch nicht gesendet."),
      );
    } catch {
      summary?.focus();
      summary?.select();
      setStatus(
        t("Automatisches Kopieren ist hier nicht verfügbar. Der Text ist markiert: Bitte kopieren Sie ihn über das Menü Ihres Geräts."),
      );
    }
  }

  return (
    <section class="wizard" aria-label={t("Projektanfrage")} aria-busy={sending()}>
      <ol class="wizard-progress" aria-label={t("Schritte der Anfrage")}>
        <For each={labels}>
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
      <Show
        when={!review()}
        fallback={
          <>
            <Show when={receipt()} fallback={<p class="form-status">{t("Bitte prüfen Sie Ihre Angaben. Mit „Anfrage senden“ übermitteln Sie diese direkt an KnaBa.")}</p>}>
              <div class="receipt-card" role="status"><strong>{t("Anfrage eingegangen")}</strong><p>{t("Ihre Vorgangsnummer:")} <code>{receipt()}</code></p><p>{t("Wir prüfen Ihren Bedarf. Ein Termin und ein Auftrag entstehen erst nach persönlicher Vereinbarung.")}</p><p>{t("Bei Rückfragen erreichen Sie uns unter")} <a href={company.phoneHref}>{company.phone}</a>.</p></div>
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
            <p class="field-hint">
              {t("Empfänger:")} <a href={`mailto:${company.email}`}>{company.email}</a>
              {t(". Alternativ können Sie Ihre Anfrage telefonisch oder per E-Mail besprechen.")}
            </p>
            <Show when={!receipt()}>
              <label class="privacy-check"><input type="checkbox" checked={privacy()} onChange={event => setPrivacy(event.currentTarget.checked)} /> <span>{t("Ich habe die")} <a href={path("/datenschutz/")} target="_blank" rel="noopener">{supportLabel("Datenschutzhinweise")}</a> {t("gelesen. Meine Angaben werden zur Bearbeitung der Anfrage gespeichert.")}</span></label>
            </Show>
            <p class="form-status" role="alert">{error()}</p>
            <div class="wizard-actions">
              <Show when={!receipt()}><button class="button button-dark" type="button" onClick={sendRequest} disabled={sending() || !privacy()}>{sending() ? t("Wird gesendet …") : t("Anfrage senden →")}</button>
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
              <Show when={receipt()}><a class="button button-dark" href={path("/konto/")}>{supportLabel("Zum Kundenportal →")}</a></Show>
              <a class="button button-dark" href={review()?.href}>
                {t("Im E-Mail-Programm öffnen ↗")}
              </a>
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
            <legend class="sr-only">{labels[step()]}</legend>
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
                      <option value={service.slug}>{service.name[locale()]}</option>
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
    </section>
  );
}
