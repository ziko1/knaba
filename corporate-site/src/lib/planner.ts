import { services } from "../data/company";

export type ServiceSlug = (typeof services)[number]["slug"];
export const defaultService: ServiceSlug = "bueroreinigung";
export const objectChoices = [
  { value: "office", label: "Büro & Gewerbe" },
  { value: "housing", label: "Wohnimmobilie" },
  { value: "construction", label: "Bauprojekt" },
  { value: "education", label: "Bildung & Betreuung" },
] as const;
export const needChoices = [
  { value: "routine", label: "Laufende Pflege" },
  { value: "glass", label: "Fenster & Fassade" },
  { value: "intensive", label: "Gründliche Reinigung" },
  { value: "handover", label: "Nach Bauarbeiten" },
] as const;
export type ObjectChoice = (typeof objectChoices)[number]["value"];
export type NeedChoice = (typeof needChoices)[number]["value"];

export function isServiceSlug(value: unknown): value is ServiceSlug {
  return typeof value === "string" && services.some((item) => item.slug === value);
}

export function recommendService(object: ObjectChoice, need: NeedChoice): ServiceSlug {
  if (need === "glass") return "glasreinigung";
  if (need === "intensive") return "grundreinigung";
  if (need === "handover" || object === "construction") return "baureinigung";
  if (object === "housing") return "treppenreinigung";
  if (object === "education") return "unterhaltsreinigung";
  return "bueroreinigung";
}

export function getService(slug: string) {
  return services.find((item) => item.slug === slug) ?? services[1];
}

const preparation: Record<ServiceSlug, readonly string[]> = {
  bueroreinigung: ["Ungefähre Bürofläche und Bereiche notieren", "Arbeits- und mögliche Zugangszeiten klären", "Gewünschte Reinigungsintervalle überlegen", "Besondere Materialien oder sensible Bereiche nennen"],
  unterhaltsreinigung: ["Regelmäßig zu reinigende Bereiche festhalten", "Nutzung und Besucheraufkommen beschreiben", "Gewünschte Reinigungsintervalle überlegen", "Zugang, Schlüssel und Ansprechpartner klären"],
  glasreinigung: ["Anzahl und ungefähre Größe der Glasflächen notieren", "Höhe und Zugänglichkeit der Flächen beschreiben", "Rahmen und Fassadenmaterial benennen", "Mögliche Zeitfenster für eine Besichtigung nennen"],
  baureinigung: ["Bauphase und aktuellen Objektzustand beschreiben", "Ungefähre Fläche und betroffene Räume notieren", "Geplanten Übergabe- oder Bezugstermin nennen", "Zugang, Wasser und Strom vor Ort klären"],
  grundreinigung: ["Verschmutzungen und betroffene Flächen beschreiben", "Boden- und Oberflächenmaterialien nennen", "Ungefähre Fläche notieren", "Besondere Anforderungen und mögliche Zeitfenster nennen"],
  treppenreinigung: ["Aufgänge und Etagen zählen", "Eingangsbereiche und Gemeinschaftsflächen notieren", "Gewünschte Reinigungsintervalle überlegen", "Zugang und Ansprechpartner für das Haus klären"],
};
export function getPreparation(slug: string): readonly string[] {
  return preparation[isServiceSlug(slug) ? slug : defaultService];
}

export interface CatalogueItem {
  slug: ServiceSlug;
  name: string;
  description: string;
  details: string[];
}
export interface CatalogueData {
  version: 1;
  services: CatalogueItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const validText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 1000;

export function parseCatalogue(value: unknown): CatalogueData {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.services) || value.services.length !== services.length)
    throw new Error("Der Leistungskatalog ist derzeit nicht lesbar.");
  const seen = new Set<string>();
  const items = value.services.map((item: unknown): CatalogueItem => {
    if (!isRecord(item) || !isServiceSlug(item.slug) || seen.has(item.slug) || !validText(item.name) || !validText(item.description) || !Array.isArray(item.details) || item.details.length < 1 || item.details.length > 8 || !item.details.every(validText))
      throw new Error("Der Leistungskatalog ist derzeit nicht lesbar.");
    seen.add(item.slug);
    return { slug: item.slug, name: item.name, description: item.description, details: [...item.details] };
  });
  return { version: 1, services: items };
}

export async function fetchCatalogue(signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<CatalogueData> {
  const timeout = AbortSignal.timeout(6000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetcher("/api/catalogue.json", { signal: combined, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Der Leistungskatalog ist momentan nicht erreichbar.");
  return parseCatalogue(await response.json());
}
