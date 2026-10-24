import { For, Show, createSignal, onMount } from "solid-js";
import { createRequestId } from "../lib/request-id";
import { portalHeader } from "../lib/portal-contract";
import { company, services } from "../data/company";
import {
  buildInquiry,
  emptyInquiry,
  frequencies,
  inquiryLimits,
  isKnownService,
  objectTypes,
  validateInquiry,
} from "../lib/inquiry";
import type { InquiryData } from "../lib/inquiry";

export default function Inquiry() {
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
  const labels = ["Leistung", "Objekt", "Kontakt"];
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
    const selected = new URLSearchParams(window.location.search).get(
      "leistung",
    );
    if (selected && isKnownService(selected))
      setData((previous) => ({ ...previous, service: selected }));
    setReady(true);
  });

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
      const issues = validateInquiry(data());
      const first = relevant.find((field) => issues[field]);
      if (first) {
        showFieldError(
          first,
          issues[first] || "Bitte prüfen Sie Ihre Angaben.",
        );
        return;
      }
      move(step() + 1);
      return;
    }
    const issues = validateInquiry(data());
    const first = (Object.keys(issues) as (keyof InquiryData)[])[0];
    if (first) {
      showFieldError(first, issues[first] || "Bitte prüfen Sie Ihre Angaben.");
      return;
    }
    try {
      setReview(buildInquiry(data()));
      setError("");
      setInvalidField(null);
      setStatus("");
      queueMicrotask(() => heading?.focus());
    } catch (cause) {
      showFieldError(
        "message",
        cause instanceof Error
          ? cause.message
          : "Bitte prüfen Sie Ihre Angaben.",
      );
    }
  }

  async function sendRequest() {
    if (sending() || receipt()) return;
    if (!privacy()) { setError("Bitte bestätigen Sie, dass Sie die Datenschutzhinweise gelesen haben."); return; }
    setSending(true); setError(""); setStatus("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      idempotencyKey ||= createRequestId();
      const response = await fetch("/api/leads", {
        method: "POST", headers: {"Content-Type":"application/json", ...portalHeader},
        body: JSON.stringify({...data(), privacyAccepted:true, website:website(), idempotencyKey}),
        signal:controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
      if (!result.received || typeof result.id !== "string") throw new Error("Die Eingangsbestätigung fehlt. Bitte versuchen Sie es erneut.");
      setReceipt(result.id);
      setStatus("Ihre Anfrage ist bei KnaBa eingegangen. Dies ist noch keine Termin- oder Auftragsbestätigung.");
      queueMicrotask(() => heading?.focus());
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Die Verbindung hat zu lange gedauert. Sie können mit derselben Anfrage erneut versuchen oder uns direkt kontaktieren.");
    } finally {clearTimeout(timer);setSending(false);}
  }

  async function copySummary() {
    const current = review();
    if (!current) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(
        `An: ${company.email}\nBetreff: ${current.subject}\n\n${current.body}`,
      );
      setStatus(
        "Anfrage kopiert. Fügen Sie den Text in eine E-Mail an kontakt@knaba.de ein. Noch nicht gesendet.",
      );
    } catch {
      summary?.focus();
      summary?.select();
      setStatus(
        "Automatisches Kopieren ist hier nicht verfügbar. Der Text ist markiert: Bitte kopieren Sie ihn über das Menü Ihres Geräts.",
      );
    }
  }

  return (
    <section class="wizard" aria-label="Reinigungsanfrage" aria-busy={sending()}>
      <ol class="wizard-progress" aria-label="Schritte der Anfrage">
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
          ? receipt() ? "Vielen Dank für Ihre Anfrage." : "Ihre Anfrage im Überblick."
          : [
              "Welche Reinigung benötigen Sie?",
              "Erzählen Sie uns von Ihrem Objekt.",
              "Wie können wir Sie erreichen?",
            ][step()]}
      </h2>
      <Show
        when={!review()}
        fallback={
          <>
            <Show when={receipt()} fallback={<p class="form-status">Bitte prüfen Sie Ihre Angaben. Mit „Anfrage senden“ übermitteln Sie diese direkt an KnaBa.</p>}>
              <div class="receipt-card" role="status"><strong>Anfrage eingegangen</strong><p>Ihre Vorgangsnummer: <code>{receipt()}</code></p><p>Wir prüfen Ihren Bedarf. Ein Termin und ein Auftrag entstehen erst nach persönlicher Vereinbarung.</p><p>Bei Rückfragen erreichen Sie uns unter <a href={company.phoneHref}>{company.phone}</a>.</p></div>
            </Show>
            <div class="review-summary">
              <label for="inquiry-summary">
                Ihre Angaben zum Prüfen und Kopieren
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
              Empfänger: <a href={`mailto:${company.email}`}>{company.email}</a>
              . Alternativ können Sie Ihre Anfrage telefonisch oder per E-Mail besprechen.
            </p>
            <Show when={!receipt()}>
              <label class="privacy-check"><input type="checkbox" checked={privacy()} onChange={event => setPrivacy(event.currentTarget.checked)} /> <span>Ich habe die <a href="/datenschutz/" target="_blank" rel="noopener">Datenschutzhinweise</a> gelesen. Meine Angaben werden zur Bearbeitung der Anfrage gespeichert.</span></label>
            </Show>
            <p class="form-status" role="alert">{error()}</p>
            <div class="wizard-actions">
              <Show when={!receipt()}><button class="button button-dark" type="button" onClick={sendRequest} disabled={sending() || !privacy()}>{sending() ? "Wird gesendet …" : "Anfrage senden →"}</button>
              <button
                type="button"
                class="button button-outline"
                disabled={sending()}
                onClick={() => {
                  setReview(null);
                  move(2);
                }}
              >
                Angaben bearbeiten
              </button></Show>
              <Show when={receipt()}><a class="button button-dark" href="/konto/">Zum Kundenportal →</a></Show>
              <a class="button button-dark" href={review()?.href}>
                Im E-Mail-Programm öffnen ↗
              </a>
              <button
                type="button"
                class="button button-outline"
                onClick={copySummary}
              >
                Anfrage kopieren
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
                  Gewünschte Leistung <span aria-hidden="true">*</span>
                </label>
                <select
                  id="inquiry-service"
                  name="service"
                  aria-invalid={invalidField() === "service" ? true : undefined}
                  aria-describedby={descriptionFor("service")}
                  value={data().service}
                  onChange={(event) =>
                    update("service", event.currentTarget.value)
                  }
                  required
                >
                  <option value="">Bitte auswählen</option>
                  <For each={services}>
                    {(service) => (
                      <option value={service.slug}>{service.name}</option>
                    )}
                  </For>
                </select>
                <p class="field-hint">
                  Wählen Sie die Leistung, die am besten zu Ihrem Bedarf passt.
                  Weitere Wünsche können Sie im letzten Schritt ergänzen.
                </p>
              </div>
            </Show>
            <Show when={step() === 1}>
              <div class="form-grid">
                <div class="field field-full">
                  <label for="inquiry-object">
                    Objektart <span aria-hidden="true">*</span>
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
                    <option value="">Bitte auswählen</option>
                    <For each={objectTypes}>
                      {(type) => <option value={type}>{type}</option>}
                    </For>
                  </select>
                </div>
                <div class="field">
                  <label for="inquiry-postcode">
                    Postleitzahl des Objekts <span aria-hidden="true">*</span>
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
                    Fünf Ziffern, z. B. 10315.
                  </span>
                </div>
                <div class="field">
                  <label for="inquiry-area">
                    Fläche in m² <span>(optional)</span>
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
                    Eine Schätzung genügt.
                  </span>
                </div>
                <div class="field field-full">
                  <label for="inquiry-frequency">
                    Häufigkeit <span aria-hidden="true">*</span>
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
                    <option value="">Bitte auswählen</option>
                    <For each={frequencies}>
                      {(frequency) => (
                        <option value={frequency}>{frequency}</option>
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
                    Ihr Name <span aria-hidden="true">*</span>
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
                    E-Mail <span aria-hidden="true">*</span>
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
                    Telefon <span>(optional)</span>
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
                    Ihre Nachricht <span>(optional)</span>
                  </label>
                  <textarea
                    id="inquiry-message"
                    name="message"
                    aria-invalid={
                      invalidField() === "message" ? true : undefined
                    }
                    aria-describedby={descriptionFor("message")}
                    rows={4}
                    maxLength={inquiryLimits.message}
                    value={data().message}
                    onInput={(event) =>
                      update("message", event.currentTarget.value)
                    }
                    placeholder="Zum Beispiel Wunschtermin, Zugangszeiten oder besondere Anforderungen."
                  />
                  <span class="field-hint">
                    {data().message.length} / {inquiryLimits.message} Zeichen.
                    Bitte keine sensiblen Daten eintragen.
                  </span>
                </div>
              </div>
              <p class="field-hint">
                Im nächsten Schritt prüfen Sie Ihre Anfrage und senden sie direkt an KnaBa.
                Eine Registrierung ist dafür nicht erforderlich. Informationen zur Verarbeitung finden Sie unter{" "}
                <a href="/datenschutz/">Datenschutz</a>.
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
                ← Zurück
              </button>
            </Show>
            <button class="button button-dark" type="submit" disabled={!ready()}>
              {step() === 2 ? "Anfrage prüfen →" : "Weiter →"}
            </button>
          </div>
          <p class="field-hint">* Pflichtfelder. Noch keine Beauftragung.</p>
        </form>
      </Show>
    </section>
  );
}
