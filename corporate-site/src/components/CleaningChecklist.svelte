<script lang="ts">
  import { onMount } from "svelte";
  import { getService, getPreparation } from "../lib/planner";
  import { plannerStore } from "../stores/planner";
  import { publicText, type PublicLocale } from "../lib/public-i18n";
  import {offerBySlug} from '../data/construction-offers';

  let { locale = "de" }: { locale?: PublicLocale } = $props();
  const t = (text: string) => publicText(text, locale);

  let selected = $state(plannerStore.getState().service);
  let topic = $state(plannerStore.getState().topic);
  let checked = $state<string[]>([]);
  const service = $derived(getService(selected, locale));
  const offer = $derived(offerBySlug(topic));
  const preparation = $derived(getPreparation(selected, locale));
  const completed = $derived(checked.filter((item) => preparation.includes(item)).length);
  onMount(() => {
    selected = plannerStore.getState().service;
    topic = plannerStore.getState().topic;
    return plannerStore.subscribe((state) => {
      if (state.service !== selected || state.topic !== topic) {
        selected = state.service;
        topic = state.topic;
        checked = [];
      }
    });
  });
  function resetChecklist() { checked = []; }
</script>

<section class="checklist" aria-labelledby="checklist-heading">
  <div class="tool-kicker"><span>02</span> {t("GUT VORBEREITET ANFRAGEN")}</div>
  <h2 id="checklist-heading">{t("Ihr Reinigungsplan.")}</h2>
  <p class="intro">{t("Eine kleine Merkliste für das erste Gespräch.")}</p>
  <div class="selected-service" aria-live="polite" aria-atomic="true">
    <span>{t("AUSGEWÄHLTE LEISTUNG")}</span>
    <h3>{offer ? offer.name[locale] : service.name}</h3>
  </div>
  <fieldset>
    <legend>{t("Diese Angaben können Sie vorbereiten")}</legend>
    {#each preparation as item}
      <label class:done={checked.includes(item)}>
        <input type="checkbox" value={item} bind:group={checked} />
        <span>{item}</span>
      </label>
    {/each}
  </fieldset>
  <div class="progress-line">
    <p role="status">{{de:`${completed} von ${preparation.length} Punkten vorbereitet`,en:`${completed} of ${preparation.length} items prepared`,uk:`Підготовлено: ${completed} із ${preparation.length}`,ru:`Подготовлено: ${completed} из ${preparation.length}`}[locale]}</p>
    <button type="button" onclick={resetChecklist} disabled={completed === 0}>{t("Zurücksetzen")}</button>
  </div>
  <progress max={preparation.length} value={completed} aria-label={t("Vorbereitete Angaben")}></progress>
  <a class="button button-dark" href={`${locale === "de" ? "" : "/"+locale}/kontakt/?leistung=${selected}${offer ? '&anliegen='+offer.slug : ''}`}>{t("Mit dieser Leistung anfragen →")}</a>
  <p class="note">{t("Die Leistung wird in die Anfrage übernommen. Häkchen bleiben nur auf dieser Seite und werden nicht übertragen. Sie können auch ohne vollständige Merkliste anfragen.")}</p>
</section>

<style>
.checklist { padding:clamp(1.4rem,3vw,2.5rem); border:1px solid #ccd8f4; border-radius:1.6rem; background:#eef1ff; height:100%; }
.tool-kicker { display:flex; gap:.65rem; align-items:center; font-size:.7rem; font-weight:800; letter-spacing:.1em; color:#4c567b; }
.tool-kicker span { display:grid; place-items:center; height:1.8rem; width:1.8rem; border-radius:50%; background:#d9dffe; color:#263b67; }
h2 { font-size:clamp(1.65rem,3vw,2.5rem); line-height:1.1; margin:1rem 0; }
.intro { color:#52617a; line-height:1.65; }
.selected-service { padding:1.2rem 0; border-bottom:1px solid #cdd5ed; margin-bottom:1.25rem; }
.selected-service>span { color:#596480; font-size:.65rem; font-weight:800; letter-spacing:.1em; }
h3 { font-size:1.35rem; line-height:1.3; margin:.45rem 0 0; overflow-wrap:anywhere; }
fieldset { border:0; padding:0; min-width:0; }
legend { font-weight:750; font-size:.9rem; margin-bottom:.8rem; }
label { display:flex; align-items:flex-start; gap:.75rem; min-height:48px; padding:.8rem 0; font-size:.9rem; line-height:1.5; cursor:pointer; }
input { flex:none; width:1.15rem; height:1.15rem; margin-top:.1rem; accent-color:#173d34; }
.done span { color:#3f625a; }
.progress-line { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:.5rem; margin-top:1rem; }
.progress-line p { font-size:.75rem; font-weight:700; }
.progress-line button { background:transparent; border:0; padding:.6rem 0; text-decoration:underline; text-underline-offset:3px; color:#30425f; cursor:pointer; font-size:.75rem; }
.progress-line button:disabled { opacity:.5; cursor:default; }
progress { display:block; appearance:none; width:100%; height:6px; border:0; border-radius:9px; overflow:hidden; margin:.5rem 0 1.5rem; background:#d9dff0; }
progress::-webkit-progress-bar { background:#d9dff0; }
progress::-webkit-progress-value { background:#315e51; }
progress::-moz-progress-bar { background:#315e51; }
.button { width:100%; white-space:normal; }
.note { font-size:.76rem; color:#52617a; line-height:1.65; margin:1rem 0 0; }
input:focus-visible,button:focus-visible,a:focus-visible { outline:3px solid #b54b2c; outline-offset:4px; }
</style>
