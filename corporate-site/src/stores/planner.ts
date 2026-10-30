import { createStore } from "zustand/vanilla";
import { defaultService, isServiceSlug, type ServiceSlug } from "../lib/planner";
import {offerBySlug} from '../data/construction-offers';

export interface PlannerState {
  service: ServiceSlug;
  topic: string;
  selectService: (slug: string) => void;
  selectTopic: (slug: string) => void;
  reset: () => void;
}

export function createPlannerStore() {
  return createStore<PlannerState>()((set) => ({
    service: defaultService,
    topic: defaultService,
    selectService: (slug) => {
      if (isServiceSlug(slug)) set({ service: slug, topic: slug });
    },
    selectTopic: (slug) => {
      if (offerBySlug(slug)?.core) set({service: defaultService, topic: slug});
    },
    reset: () => set({ service: defaultService, topic: defaultService }),
  }));
}

// No persistence, personal data, or writes during SSR. The bundled browser module
// provides one shared selection to Vue, Svelte and Solid islands on this page.
export const plannerStore = createPlannerStore();
