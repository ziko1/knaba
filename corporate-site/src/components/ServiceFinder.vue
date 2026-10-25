<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { objectChoices, needChoices, recommendConstructionTopic } from "../lib/planner";
import {offerBySlug} from '../data/construction-offers';
import { useFinderStore } from "../stores/finder";
import { plannerStore } from "../stores/planner";
import { publicText, type PublicLocale } from "../lib/public-i18n";

const props = withDefaults(defineProps<{ locale?: PublicLocale }>(), { locale: "de" });
const t = (text: string) => publicText(text, props.locale);

const finder = useFinderStore();
const selected = ref(plannerStore.getState().topic);
const suggestion = computed(() => offerBySlug(recommendConstructionTopic(finder.need))!);
let unsubscribe: (() => void) | undefined;
onMounted(() => {
  selected.value = plannerStore.getState().topic;
  unsubscribe = plannerStore.subscribe((state) => { selected.value = state.topic; });
});
onUnmounted(() => unsubscribe?.());
function choose() { plannerStore.getState().selectTopic(suggestion.value.slug); }
</script>

<template>
  <section class="finder" aria-labelledby="finder-heading">
    <div class="tool-kicker"><span>01</span> {{ t("PASSENDE LEISTUNG FINDEN") }}</div>
    <h2 id="finder-heading">{{ t("Was braucht Ihr Objekt?") }}</h2>
    <p class="intro">{{ t("Zwei Angaben helfen bei der Orientierung. Den genauen Umfang stimmen wir persönlich ab.") }}</p>
    <fieldset>
      <legend>{{ t("Ihr Objekt") }}</legend>
      <div class="choices">
        <button v-for="option in objectChoices" :key="option.value" type="button" :aria-pressed="finder.object === option.value" @click="finder.chooseObject(option.value)">{{ t(option.label) }}</button>
      </div>
    </fieldset>
    <fieldset>
      <legend>{{ t("Ihr Schwerpunkt") }}</legend>
      <div class="choices">
        <button v-for="option in needChoices" :key="option.value" type="button" :aria-pressed="finder.need === option.value" @click="finder.chooseNeed(option.value)">{{ t(option.label) }}</button>
      </div>
    </fieldset>
    <div class="recommendation" aria-live="polite" aria-atomic="true">
      <span class="recommendation-label">{{ t("UNSERE ORIENTIERUNGSHILFE") }}</span>
      <h3>{{ suggestion.name[props.locale] }}</h3>
      <p>{{ t(objectChoices.find(option => option.value === finder.object)!.label) }} · {{ t(needChoices.find(option => option.value === finder.need)!.label) }}</p>
      <p>{{ suggestion.description[props.locale] }}</p>
      <button class="button button-dark" type="button" @click="choose">{{ selected === suggestion.slug ? t("Im Plan ausgewählt ✓") : t("Für meinen Plan auswählen →") }}</button>
      <a :href="`${props.locale === 'de' ? '' : '/'+props.locale}/bauleistungen/${suggestion.slug}/`">{{ t("Leistung im Detail ansehen ↗") }}</a>
    </div>
    <p class="note">{{ t("Nur eine Orientierungshilfe. Keine automatische Buchung und keine Preiszusage.") }}</p>
  </section>
</template>

<style scoped>
.finder { padding:clamp(1.4rem,3vw,2.5rem); border:1px solid #dce5e2; border-radius:1.6rem; background:#fff; height:100%; }
.tool-kicker { display:flex; gap:.65rem; align-items:center; font-size:.7rem; font-weight:800; letter-spacing:.1em; color:#41635b; }
.tool-kicker span { display:grid; place-items:center; height:1.8rem; width:1.8rem; border-radius:50%; background:#e2f2b6; color:#173c35; }
h2 { font-size:clamp(1.65rem,3vw,2.5rem); line-height:1.1; margin:1rem 0; }
.intro,.note { color:#52685f; line-height:1.65; }
fieldset { border:0; padding:0; margin:1.6rem 0; min-width:0; }
legend { font-size:.9rem; font-weight:750; margin-bottom:.75rem; }
.choices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.6rem; }
.choices button { border:1px solid #cddbd5; border-radius:.8rem; padding:.8rem .65rem; text-align:left; font:inherit; font-size:.86rem; cursor:pointer; background:#f6f8f5; color:#183d33; min-height:48px; overflow-wrap:anywhere; }
.choices button[aria-pressed="true"] { background:#173d34; border-color:#173d34; color:#fff; }
button:focus-visible,a:focus-visible { outline:3px solid #b54b2c; outline-offset:4px; }
.recommendation { background:#edf3f0; border-radius:1rem; padding:1.2rem; }
.recommendation-label { font-size:.65rem; letter-spacing:.1em; font-weight:800; color:#49665b; }
h3 { font-size:1.35rem; line-height:1.2; margin:.6rem 0; overflow-wrap:anywhere; }
.recommendation p { font-size:.9rem; line-height:1.6; margin:.7rem 0 1rem; }
.recommendation .button { width:100%; white-space:normal; }
.recommendation a { display:block; margin-top:1rem; font-size:.85rem; text-decoration:underline; text-underline-offset:4px; }
.note { font-size:.76rem; margin:1rem 0 0; }
@media(max-width:370px) { .choices { grid-template-columns:1fr; } }
</style>
