import { services } from "../data/company";
import { localizedService, type PublicLocale } from "./public-i18n";

export type ServiceSlug = (typeof services)[number]["slug"];
export const defaultService: ServiceSlug = "baureinigung";
export const objectChoices = [
  { value: "office", label: "Gewerbebau & Sanierung" },
  { value: "housing", label: "Wohnbau & Modernisierung" },
  { value: "construction", label: "Neubau & Baustelle" },
  { value: "education", label: "Technik & Leitungen" },
] as const;
export const needChoices = [
  { value: "routine", label: "Bauzwischenreinigung" },
  { value: "glass", label: "Baufeinreinigung" },
  { value: "intensive", label: "Baustellenberäumung" },
  { value: "handover", label: "Bauendreinigung" },
] as const;
export type ObjectChoice = (typeof objectChoices)[number]["value"];
export type NeedChoice = (typeof needChoices)[number]["value"];

/** Marketing detail is separate from the stable CRM baureinigung enum. */
export function recommendConstructionTopic(need: NeedChoice) {
  return {routine:'bauzwischenreinigung',glass:'bauendreinigung',intensive:'baustellenraeumung',handover:'bauendreinigung'}[need];
}

export function isServiceSlug(value: unknown): value is ServiceSlug {
  return typeof value === "string" && services.some((item) => item.slug === value);
}

export function recommendService(_object: ObjectChoice, _need: NeedChoice): ServiceSlug {
  // Published construction-cleaning requests use the stable existing CRM enum.
  return "baureinigung";
}

export function getService(slug: string, locale: PublicLocale = "de") {
  return localizedService(services.find((item) => item.slug === slug) ?? services.find((item)=>item.slug === defaultService)!, locale);
}

const preparation: Record<ServiceSlug, readonly string[]> = {
  bueroreinigung: ["Ungefähre Bürofläche und Bereiche notieren", "Arbeits- und mögliche Zugangszeiten klären", "Gewünschte Reinigungsintervalle überlegen", "Besondere Materialien oder sensible Bereiche nennen"],
  unterhaltsreinigung: ["Regelmäßig zu reinigende Bereiche festhalten", "Nutzung und Besucheraufkommen beschreiben", "Gewünschte Reinigungsintervalle überlegen", "Zugang, Schlüssel und Ansprechpartner klären"],
  glasreinigung: ["Anzahl und ungefähre Größe der Glasflächen notieren", "Höhe und Zugänglichkeit der Flächen beschreiben", "Rahmen und Fassadenmaterial benennen", "Mögliche Zeitfenster für eine Besichtigung nennen"],
  baureinigung: ["Bauphase und aktuellen Objektzustand beschreiben", "Ungefähre Fläche und betroffene Räume notieren", "Geplanten Übergabe- oder Bezugstermin nennen", "Zugang, Wasser und Strom vor Ort klären"],
  grundreinigung: ["Verschmutzungen und betroffene Flächen beschreiben", "Boden- und Oberflächenmaterialien nennen", "Ungefähre Fläche notieren", "Besondere Anforderungen und mögliche Zeitfenster nennen"],
  treppenreinigung: ["Aufgänge und Etagen zählen", "Eingangsbereiche und Gemeinschaftsflächen notieren", "Gewünschte Reinigungsintervalle überlegen", "Zugang und Ansprechpartner für das Haus klären"],
};
const constructionPreparation = {
  en: ['Describe the construction stage and current condition', 'Note approximate floor area and affected rooms', 'Give the planned handover or occupancy date', 'Confirm site access, water and electricity'],
  uk: ['Опишіть етап будівництва та стан об’єкта', 'Укажіть приблизну площу й приміщення', 'Назвіть заплановану дату здачі або заселення', 'Уточніть доступ, воду та електрику на об’єкті'],
} as const;
const preparationRu: Record<ServiceSlug, readonly string[]> = {
  bueroreinigung: ["Укажите приблизительную площадь офиса и его зоны", "Уточните рабочее время и возможное время доступа", "Продумайте желаемую периодичность уборки", "Укажите особые материалы или зоны с ограничениями"],
  unterhaltsreinigung: ["Перечислите зоны для регулярной уборки", "Опишите использование объекта и поток посетителей", "Продумайте желаемую периодичность уборки", "Уточните доступ, ключи и контактное лицо"],
  glasreinigung: ["Укажите количество и приблизительные размеры стеклянных поверхностей", "Опишите высоту и доступность поверхностей", "Укажите материалы рам и фасада", "Предложите возможное время для осмотра"],
  baureinigung: ["Опишите этап строительства и текущее состояние объекта", "Укажите приблизительную площадь и помещения", "Укажите планируемую дату передачи или заселения", "Уточните доступ, наличие воды и электричества на объекте"],
  grundreinigung: ["Опишите загрязнения и поверхности", "Укажите материалы пола и других поверхностей", "Укажите приблизительную площадь", "Укажите особые требования и возможное время работ"],
  treppenreinigung: ["Укажите количество подъездов и этажей", "Перечислите входные и общие зоны", "Продумайте желаемую периодичность уборки", "Уточните доступ и контактное лицо по дому"],
};
export function getPreparation(slug: string, locale: PublicLocale = "de"): readonly string[] {
  const selected = isServiceSlug(slug) ? slug : defaultService;
  if (selected === 'baureinigung' && (locale === 'en' || locale === 'uk')) return constructionPreparation[locale];
  return (locale === "ru" ? preparationRu : preparation)[selected];
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
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.services) || !([1,services.length].includes(value.services.length)))
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


/** Site-support topics need preparation distinct from final-cleaning handover. */
export function getTopicPreparation(topic: string, service: string, locale: PublicLocale = "de"): readonly string[] {
  if (topic !== 'bauhilfe' && topic !== 'baustellenraeumung') return getPreparation(service, locale);
  const items = {
    de: [topic === 'bauhilfe' ? 'Aufgaben und benötigte Unterstützung beschreiben' : 'Materialarten, Mengen und freizuräumende Bereiche nennen', 'Zeitraum, Arbeitszeiten und Ansprechpartner vor Ort klären', 'Zugang, Transportwege und Schutzmaßnahmen abstimmen', 'Leistungsgrenzen und gegebenenfalls Entsorgung separat vereinbaren'],
    en: [topic === 'bauhilfe' ? 'Describe the tasks and support needed' : 'List material types, quantities and areas to clear', 'Confirm dates, working hours and the site contact', 'Agree access, transport routes and safety measures', 'Agree scope limits and any waste disposal separately'],
    uk: [topic === 'bauhilfe' ? 'Опишіть завдання та потрібну допомогу' : 'Укажіть матеріали, обсяги й ділянки для звільнення', 'Уточніть строки, робочі години та відповідального на об’єкті', 'Узгодьте доступ, маршрути перевезення й заходи безпеки', 'Окремо погодьте межі робіт і можливе вивезення відходів'],
    ru: [topic === 'bauhilfe' ? 'Опишите задачи и необходимую помощь' : 'Укажите материалы, объёмы и участки для освобождения', 'Уточните сроки, рабочие часы и ответственного на объекте', 'Согласуйте доступ, пути перевозки и меры безопасности', 'Отдельно согласуйте границы работ и возможный вывоз отходов'],
  };
  return items[locale];
}
