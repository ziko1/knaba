import type { App } from "vue";
import { createPinia } from "pinia";

export default function configureVue(app: App) {
  // New instance per Astro-rendered Vue app, including every server render.
  app.use(createPinia());
}
