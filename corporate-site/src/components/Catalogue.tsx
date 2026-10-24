import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { QueryClient, QueryClientProvider, createQuery } from "@tanstack/solid-query";
import { fetchCatalogue } from "../lib/planner";
import { plannerStore } from "../stores/planner";
import { publicText, localizedService, type PublicLocale } from "../lib/public-i18n";

function CatalogueContent(props: { locale?: PublicLocale }) {
  const t = (text: string) => publicText(text, props.locale);
  const [enabled, setEnabled] = createSignal(false);
  const [selected, setSelected] = createSignal(plannerStore.getState().service);
  onMount(() => {
    setSelected(plannerStore.getState().service);
    const unsubscribe = plannerStore.subscribe((state) => setSelected(state.service));
    onCleanup(unsubscribe);
    setEnabled(true);
  });
  const query = createQuery(() => ({
    queryKey: ["knaba-services", 1],
    queryFn: ({ signal }) => fetchCatalogue(signal),
    enabled: enabled(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    retryDelay: 500,
    networkMode: "always" as const,
    refetchOnWindowFocus: false,
  }));
  return (
    <section aria-labelledby="catalogue-heading" class="mt-12 rounded-3xl border border-slate-200 bg-white p-6 sm:p-9">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-bold tracking-widest text-emerald-900">{t("ODER DIREKT AUSWÄHLEN")}</p>
          <h2 id="catalogue-heading" class="mt-3 text-3xl font-bold tracking-tight">{t("Alle Leistungen im Überblick.")}</h2>
        </div>
        <a class="text-link" href={props.locale === "ru" ? "/ru/leistungen/" : "/leistungen/"}>{t("Zu den Leistungsseiten ↗")}</a>
      </div>
      <p class="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{t("Wählen Sie eine Leistung für Ihren Plan. Umfang und Verfügbarkeit klären wir gemeinsam für Ihr Objekt.")}</p>
      <Switch>
        <Match when={query.isPending}>
          <p role="status" class="my-8 rounded-xl bg-slate-50 p-5 text-slate-700">{t("Leistungskatalog wird geladen …")}</p>
        </Match>
        <Match when={query.isError}>
          <div role="alert" class="my-8 rounded-xl border border-orange-200 bg-orange-50 p-5">
            <p>{t("Der Leistungskatalog konnte nicht geladen werden. Prüfen Sie Ihre Verbindung oder nutzen Sie die Leistungsseiten.")}</p>
            <button type="button" class="button button-outline mt-4" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? t("Wird geladen …") : t("Erneut laden")}</button>
          </div>
        </Match>
        <Match when={query.isSuccess}>
          <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <For each={query.data?.services}>{(service) => (
              <button type="button" aria-pressed={selected() === service.slug} onClick={() => plannerStore.getState().selectService(service.slug)} class="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left transition-colors hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700 aria-pressed:border-emerald-800 aria-pressed:bg-emerald-50">
                <span class="block text-base font-bold leading-snug text-emerald-950 [overflow-wrap:anywhere]">{localizedService(service, props.locale).name}</span>
                <span class="mt-2 block text-sm leading-relaxed text-slate-600">{localizedService(service, props.locale).description}</span>
                <span class="mt-4 block text-xs font-bold text-emerald-900">{selected() === service.slug ? t("Im Plan ausgewählt ✓") : t("Für meinen Plan auswählen →")}</span>
              </button>
            )}</For>
          </div>
          <Show when={query.isFetching}><p role="status" class="mt-4 text-xs text-slate-600">{t("Katalog wird aktualisiert …")}</p></Show>
        </Match>
      </Switch>
      <noscript><p>{t("Die interaktive Auswahl benötigt JavaScript. Alle Leistungen sind über die Leistungsseiten erreichbar.")}</p></noscript>
    </section>
  );
}

export default function Catalogue(props: { locale?: PublicLocale } = {}) {
  // A separate client per island render prevents cache sharing between SSR requests.
  const client = new QueryClient();
  return <QueryClientProvider client={client}><CatalogueContent locale={props.locale} /></QueryClientProvider>;
}
