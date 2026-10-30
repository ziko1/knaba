import { describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { services } from "../src/data/company";
import { createPlannerStore } from "../src/stores/planner";
import { useFinderStore } from "../src/stores/finder";
import { fetchCatalogue, getPreparation, getTopicPreparation, parseCatalogue, recommendConstructionTopic, recommendService } from "../src/lib/planner";

const catalogue = () => ({ version: 1, services: services.map(({ slug, name, description, details }) => ({ slug, name, description, details: [...details] })) });

describe("useful recommendations", () => {
  it("maps routine object needs independently", () => {
    expect(recommendService("office", "routine")).toBe("baureinigung");
    expect(recommendService("housing", "routine")).toBe("baureinigung");
    expect(recommendService("education", "routine")).toBe("baureinigung");
    expect(recommendService("construction", "routine")).toBe("baureinigung");
  });
  it("honors explicit special tasks over the object category", () => {
    expect(recommendService("housing", "glass")).toBe("baureinigung");
    expect(recommendService("construction", "intensive")).toBe("baureinigung");
    expect(recommendService("office", "handover")).toBe("baureinigung");
  });
  it("updates the Pinia-derived recommendation without selecting a service", () => {
    setActivePinia(createPinia());
    const finder = useFinderStore();
    finder.chooseObject("housing");
    expect(finder.recommendation).toBe("baureinigung");
    finder.chooseNeed("glass");
    expect(finder.recommendation).toBe("baureinigung");
  });
});

describe("shared selection", () => {
  it("prepares site support and clearance instead of promising a cleaning handover", () => {
    expect(getTopicPreparation('bauhilfe', 'baureinigung', 'de')[0]).toContain('Unterstützung');
    expect(getTopicPreparation('baustellenraeumung', 'baureinigung', 'en')[0]).toContain('material types');
    for (const locale of ['de', 'en', 'uk', 'ru'] as const) {
      const support = getTopicPreparation('bauhilfe', 'baureinigung', locale);
      expect(support).toHaveLength(4);
      expect(support).not.toEqual(getPreparation('baureinigung', locale));
      expect(getTopicPreparation('bauendreinigung', 'baureinigung', locale)).toEqual(getPreparation('baureinigung', locale));
    }
  });

  it("selects each published core topic without changing the CRM service contract", () => {
    const store = createPlannerStore();
    for (const topic of ['baureinigung','bauzwischenreinigung','bauendreinigung','baustellenraeumung','bauhilfe']) {
      store.getState().selectTopic(topic);
      expect(store.getState().topic).toBe(topic);
      expect(store.getState().service).toBe('baureinigung');
    }
    store.getState().selectTopic('kernbohrungen');
    expect(store.getState().topic).toBe('bauhilfe');
  });

  it("preserves the chosen cleaning phase across islands without changing the CRM service", () => {
    const store = createPlannerStore();
    expect(recommendConstructionTopic('routine')).toBe('bauzwischenreinigung');
    expect(recommendConstructionTopic('intensive')).toBe('baustellenraeumung');
    store.getState().selectTopic(recommendConstructionTopic('intensive'));
    expect(store.getState().service).toBe('baureinigung');
    expect(store.getState().topic).toBe('baustellenraeumung');
    store.getState().selectTopic('kernbohrungen');
    expect(store.getState().topic).toBe('baustellenraeumung');
    store.getState().reset();
    expect(store.getState().topic).toBe('baureinigung');
  });
  it("provides genuinely translated construction preparation", () => {
    expect(getPreparation('baureinigung', 'en')).toContain('Confirm site access, water and electricity');
    expect(getPreparation('baureinigung', 'uk')).toContain('Уточніть доступ, воду та електрику на об’єкті');
  });
  it("notifies islands about a selection and lets them unsubscribe", () => {
    const store = createPlannerStore();
    const observed: string[] = [];
    const unsubscribe = store.subscribe((state) => observed.push(state.service));
    store.getState().selectService("baureinigung");
    expect(store.getState().service).toBe("baureinigung");
    expect(observed).toEqual(["baureinigung"]);
    unsubscribe();
    store.getState().reset();
    expect(store.getState().service).toBe("baureinigung");
    expect(observed).toEqual(["baureinigung"]);
  });
  it("ignores invalid slugs and isolates store instances", () => {
    const first = createPlannerStore();
    const second = createPlannerStore();
    first.getState().selectService("glasreinigung");
    first.getState().selectService("../../kontakt");
    expect(first.getState().service).toBe("glasreinigung");
    expect(second.getState().service).toBe("baureinigung");
  });
  it("offers specific construction preparation and a safe fallback", () => {
    expect(getPreparation("baureinigung")).toContain("Geplanten Übergabe- oder Bezugstermin nennen");
    expect(getPreparation("unknown")).toEqual(getPreparation("baureinigung"));
  });
});

describe("catalogue boundary", () => {
  it("accepts all six canonical services", () => {
    expect(parseCatalogue(catalogue()).services.map((item) => item.slug)).toEqual(services.map((item) => item.slug));
  });
  it("rejects wrong versions, missing services, duplicates and unknown slugs", () => {
    expect(() => parseCatalogue({ ...catalogue(), version: 2 })).toThrow();
    expect(() => parseCatalogue({ version: 1, services: [] })).toThrow();
    const repeated = catalogue();
    repeated.services[1] = repeated.services[0]!;
    expect(() => parseCatalogue(repeated)).toThrow();
    const altered = JSON.parse(JSON.stringify(catalogue()));
    altered.services[0].slug = "invented";
    expect(() => parseCatalogue(altered)).toThrow();
  });
  it("rejects malformed content fields", () => {
    const altered = JSON.parse(JSON.stringify(catalogue()));
    altered.services[0].details = [null];
    expect(() => parseCatalogue(altered)).toThrow();
  });
  it("loads the real endpoint contract and passes cancellation", async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(catalogue()), { headers: { "content-type": "application/json" } }));
    const controller = new AbortController();
    expect((await fetchCatalogue(controller.signal, mock)).services).toHaveLength(6);
    expect(mock).toHaveBeenCalledWith("/api/catalogue.json", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const passedSignal = mock.mock.calls[0]![1]!.signal!;
    controller.abort();
    expect(passedSignal.aborted).toBe(true);
  });
  it("does not turn HTTP or network failure into a successful empty catalogue", async () => {
    const httpFailure = vi.fn<typeof fetch>().mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await expect(fetchCatalogue(undefined, httpFailure)).rejects.toThrow("nicht erreichbar");
    const networkFailure = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    await expect(fetchCatalogue(undefined, networkFailure)).rejects.toThrow("offline");
  });
});
