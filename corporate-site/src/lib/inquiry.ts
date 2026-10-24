import { company, services } from "../data/company.ts";

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
  return errors;
}

export function buildInquiry(data: InquiryData): {
  subject: string;
  body: string;
  href: string;
} {
  const errors = validateInquiry(data);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const service = services.find((service) => service.slug === data.service)!;
  const subject = `Reinigungsanfrage: ${service.name}`;
  const body = [
    "Guten Tag KnaBa,",
    "",
    "ich möchte folgenden Reinigungsbedarf mit Ihnen besprechen:",
    "",
    `Leistung: ${service.name}`,
    `Objektart: ${data.objectType}`,
    `Postleitzahl: ${data.postcode.trim()}`,
    `Ungefähre Fläche: ${data.area.trim() ? `${data.area} m²` : "Noch offen"}`,
    `Häufigkeit: ${data.frequency}`,
    "",
    `Name: ${data.name.trim()}`,
    `E-Mail: ${data.email.trim()}`,
    `Telefon: ${data.phone.trim() || "Nicht angegeben"}`,
    "",
    `Nachricht: ${data.message.trim() || "Weitere Details besprechen wir gern persönlich."}`,
    "",
    "Bitte kontaktieren Sie mich zur Abstimmung. Vielen Dank!",
  ].join("\n");
  const href = `mailto:${company.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (href.length > inquiryLimits.mailto)
    throw new Error(
      "Die Anfrage ist für das E-Mail-Programm zu lang. Bitte kürzen Sie die Nachricht oder kontaktieren Sie uns direkt.",
    );
  return { subject, body, href };
}
