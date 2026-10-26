import { createSignal, For, onCleanup, onMount } from "solid-js";
import { constructionOffers, localeValue } from "../data/construction-offers";
import { plannerStore } from "../stores/planner";
import { publicText, type PublicLocale } from "../lib/public-i18n";

export default function Catalogue(props: { locale?: PublicLocale }) {
  const t = (text: string) => publicText(text, props.locale);
  const [selected, setSelected] = createSignal(plannerStore.getState().topic);
  onMount(() => {
    setSelected(plannerStore.getState().topic);
    const unsubscribe = plannerStore.subscribe((state) => setSelected(state.topic));
    onCleanup(unsubscribe);
  });
  return (
    <section aria-labelledby="catalogue-heading" class="mt-12 rounded-3xl border border-slate-200 bg-white p-6 sm:p-9">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-bold tracking-widest text-emerald-900">{t("ODER DIREKT AUSWÄHLEN")}</p>
          <h2 id="catalogue-heading" class="mt-3 text-3xl font-bold tracking-tight">{t("Alle Leistungen im Überblick.")}</h2>
        </div>
        <a class="text-link" href={props.locale === "de" || !props.locale ? "/leistungen/" : "/" + props.locale + "/leistungen/"}>{t("Zu den Leistungsseiten ↗")}</a>
      </div>
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{t("Wählen Sie eine Leistung für Ihren Plan. Umfang und Verfügbarkeit klären wir gemeinsam für Ihr Objekt.")}</p>
          <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <For each={constructionOffers.filter(offer => offer.core)}>{(service) => (
              <button type="button" data-planner-topic={service.slug} aria-pressed={selected() === service.slug} onClick={() => plannerStore.getState().selectTopic(service.slug)} class="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition-colors hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700 aria-pressed:border-emerald-800 aria-pressed:bg-emerald-50">
                <span class="block text-base font-bold leading-snug text-emerald-950 [overflow-wrap:anywhere]">{localeValue(service.name, props.locale ?? "de")}</span>
                <span class="mt-2 block text-sm leading-relaxed text-slate-600">{localeValue(service.description, props.locale ?? "de")}</span>
                <span class="mt-4 block text-xs font-bold text-emerald-900">{selected() === service.slug ? t("Im Plan ausgewählt ✓") : t("Für meinen Plan auswählen →")}</span>
              </button>
            )}</For>
          </div>
      <noscript><p>{t("Die interaktive Auswahl benötigt JavaScript. Alle Leistungen sind über die Leistungsseiten erreichbar.")}</p></noscript>
    </section>
  );
}
