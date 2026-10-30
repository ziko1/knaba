import { offerBySlug } from "../data/construction-offers.ts";
import { company, services } from "../data/company.ts";
import { publicOfferName, publicText, localizedService, type PublicLocale } from "./public-i18n.ts";

export const objectTypes = [
  "Büro / Gewerbe",
  "Wohngebäude / Treppenhaus",
  "Baustelle",
  "Bildung / Betreuung",
  "Anderes Objekt",
] as const;
export const frequencies = ["Einmalig", "Regelmäßig", "Noch offen"] as const;
export const inquiryLimits = {
  name: 80,
  email: 160,
  phone: 30,
  message: 500,
  mailto: 12000,
} as const;

export interface InquiryData {
  service: string;
  objectType: string;
  postcode: string;
  area: string;
  frequency: string;
  name: string;
  email: string;
  phone: string;
  message: string;
}

export const emptyInquiry = (): InquiryData => ({
  service: "",
  objectType: "",
  postcode: "",
  area: "",
  frequency: "",
  name: "",
  email: "",
  phone: "",
  message: "",
});

export function isKnownService(value: string): boolean {
  return services.some((service) => service.slug === value);
}

export function validateInquiry(
  data: InquiryData,
  locale: PublicLocale = "de",
): Partial<Record<keyof InquiryData, string>> {
  const errors: Partial<Record<keyof InquiryData, string>> = {};
  if (!isKnownService(data.service))
    errors.service = "Bitte wählen Sie eine Leistung.";
  if (!objectTypes.some((type) => type === data.objectType))
    errors.objectType = "Bitte wählen Sie die Objektart.";
  if (!/^\d{5}$/.test(data.postcode.trim()))
    errors.postcode = "Bitte geben Sie eine fünfstellige Postleitzahl an.";
  if (
    data.area.trim() &&
    (!/^\d{1,7}$/.test(data.area) ||
      Number(data.area) < 1 ||
      Number(data.area) > 1000000)
  )
    errors.area =
      "Bitte geben Sie eine Fläche zwischen 1 und 1.000.000 m² an oder lassen Sie das Feld frei.";
  if (!frequencies.some((frequency) => frequency === data.frequency))
    errors.frequency = "Bitte wählen Sie die gewünschte Häufigkeit.";
  if (
    !data.name.trim() ||
    data.name.length > inquiryLimits.name ||
    /[\r\n\u0000-\u001f]/.test(data.name)
  )
    errors.name = "Bitte geben Sie Ihren Namen an (maximal 80 Zeichen).";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()) ||
    data.email.length > inquiryLimits.email
  )
    errors.email = "Bitte geben Sie eine gültige E-Mail-Adresse an.";
  if (
    data.phone.length > inquiryLimits.phone ||
    (data.phone.trim() && !/^[+\d\s()./-]{5,30}$/.test(data.phone)) ||
    /[\r\n\u0000-\u001f]/.test(data.phone)
  )
    errors.phone = "Bitte prüfen Sie Ihre Telefonnummer.";
  if (
    data.message.length > inquiryLimits.message ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data.message)
  )
    errors.message = "Die Nachricht darf maximal 500 Zeichen enthalten.";
  if (locale !== "de") for (const field of Object.keys(errors) as (keyof InquiryData)[]) errors[field] = publicText(errors[field]!, locale);
  return errors;
}

export function buildInquiry(data: InquiryData, locale: PublicLocale = "de", constructionTopic = ""): {
  subject: string;
  body: string;
  href: string;
} {
  const errors = validateInquiry(data, locale);
  const t = (text: string) => publicText(text, locale);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const service = localizedService(services.find((service) => service.slug === data.service)!, locale);
  const offer = constructionTopic ? offerBySlug(constructionTopic) : undefined;
  if (constructionTopic && !offer) throw new Error("Unknown construction topic");
  const serviceName = offer ? publicOfferName(offer,locale) : service.name;
  const subject = `${t(offer ? "Projektanfrage:" : "Reinigungsanfrage:")} ${serviceName}`;
  const body = [
    t("Guten Tag KnaBa,"),
    "",
    t(offer ? "ich möchte folgenden Bedarf mit Ihnen besprechen:" : "ich möchte folgenden Reinigungsbedarf mit Ihnen besprechen:"),
    "",
    `${t("Leistung")}: ${serviceName}`,
    `${t("Objektart")}: ${t(data.objectType)}`,
    `${t("Postleitzahl")}: ${data.postcode.trim()}`,
    `${t("Ungefähre Fläche")}: ${data.area.trim() ? `${data.area} ${locale === "ru" ? "м²" : "m²"}` : t("Noch offen")}`,
    `${t("Häufigkeit")}: ${t(data.frequency)}`,
    "",
    `${t("Name")}: ${data.name.trim()}`,
    `${t("E-Mail")}: ${data.email.trim()}`,
    `${t("Telefon")}: ${data.phone.trim() || t("Nicht angegeben")}`,
    "",
    `${t("Nachricht")}: ${data.message.trim() || t("Weitere Details besprechen wir gern persönlich.")}`,
    "",
    t("Bitte kontaktieren Sie mich zur Abstimmung. Vielen Dank!"),
  ].join("\n");
  const href = `mailto:${company.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (href.length > inquiryLimits.mailto)
    throw new Error(
      t("Die Anfrage ist für das E-Mail-Programm zu lang. Bitte kürzen Sie die Nachricht oder kontaktieren Sie uns direkt."),
    );
  return { subject, body, href };
}
