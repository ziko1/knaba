import { createStore } from "zustand/vanilla";
import { defaultService, isServiceSlug, type ServiceSlug } from "../lib/planner";

export interface PlannerState {
  service: ServiceSlug;
  selectService: (slug: string) => void;
  reset: () => void;
}

export function createPlannerStore() {
  return createStore<PlannerState>()((set) => ({
    service: defaultService,
    selectService: (slug) => {
      if (isServiceSlug(slug)) set({ service: slug });
    },
    reset: () => set({ service: defaultService }),
  }));
}

// No persistence, personal data, or writes during SSR. The bundled browser module
// provides one shared selection to Vue, Svelte and Solid islands on this page.
export const plannerStore = createPlannerStore();
