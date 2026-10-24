import { defineStore } from "pinia";
import { recommendService, type ObjectChoice, type NeedChoice } from "../lib/planner";

export const useFinderStore = defineStore("service-finder", {
  state: () => ({ object: "office" as ObjectChoice, need: "routine" as NeedChoice }),
  getters: {
    recommendation: (state) => recommendService(state.object, state.need),
  },
  actions: {
    chooseObject(value: ObjectChoice) { this.object = value; },
    chooseNeed(value: NeedChoice) { this.need = value; },
  },
});
