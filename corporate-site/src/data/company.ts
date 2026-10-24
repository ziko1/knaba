export const company = {
  name: "KnaBa",
  descriptor: "Gebäudereinigung",
  legalName: "Alexander Knaus · KNABA Bauhelfer",
  phone: "+49 (30) 679 330 54",
  phoneHref: "tel:+493067933054",
  email: "kontakt@knaba.de",
  street: "Im Achterkastell 39",
  city: "10315 Berlin",
  region: "Berlin & Brandenburg",
  vatId: "DE263654022",
  source: "https://knaba.de/impressum",
} as const;

export const services = [
  {
    slug: "unterhaltsreinigung",
    name: "Unterhaltsreinigung",
    short: "Sauberkeit, die bleibt.",
    icon: "sparkle",
    tag: "Regelmäßig & planbar",
    description:
      "Gepflegte Räume im Alltag. Wir stimmen Reinigungsumfang und Intervalle auf Ihr Objekt und seine Nutzung ab.",
    details: [
      "Boden- und Oberflächenreinigung",
      "Sanitär- und Gemeinschaftsbereiche",
      "Individuell abgestimmte Reinigungsintervalle",
    ],
    audience: "Büros, Schulen, Kitas und Gewerbeimmobilien",
    questions:
      "Welche Flächen sollen wie häufig gereinigt werden? Gibt es besondere Zugangszeiten?",
  },
  {
    slug: "bueroreinigung",
    name: "Büroreinigung",
    short: "Raum für gute Arbeit.",
    icon: "office",
    tag: "Für Ihren Arbeitsalltag",
    description:
      "Saubere Arbeitsplätze, Besprechungsräume und Empfangsbereiche. Ein Reinigungskonzept, das zu Ihrem Büroalltag passt.",
    details: [
      "Arbeits- und Besprechungsbereiche",
      "Empfang, Teeküche und Sanitärbereiche",
      "Abstimmung auf Betriebs- und Zugangszeiten",
    ],
    audience: "Unternehmen, Kanzleien und Verwaltungen",
    questions:
      "Wie groß ist Ihr Büro? Welche Bereiche und Zeitfenster sollen berücksichtigt werden?",
  },
  {
    slug: "glasreinigung",
    name: "Glas- & Fassadenreinigung",
    short: "Ein klarer erster Eindruck.",
    icon: "window",
    tag: "Glas & Außenflächen",
    description:
      "Für den freien Blick und einen gepflegten Auftritt: Reinigung von Fenstern, Glasflächen und Fassaden nach Objektbesichtigung.",
    details: [
      "Fenster und Glasflächen",
      "Rahmen nach vereinbartem Leistungsumfang",
      "Fassadenreinigung nach Material und Zugänglichkeit",
    ],
    audience: "Gewerbeobjekte, Wohnhäuser und öffentliche Gebäude",
    questions:
      "Welche Glasflächen oder Fassaden sollen gereinigt werden? Wie sind die Flächen erreichbar?",
  },
  {
    slug: "baureinigung",
    name: "Baureinigung",
    short: "Vom Bau zum fertigen Raum.",
    icon: "building",
    tag: "Vom Rohbau bis zur Übergabe",
    description:
      "Baugrob-, Baufein- und Bauendreinigung: Wir begleiten Ihr Bauvorhaben bis zum gereinigten Objekt.",
    details: [
      "Baugrobreinigung während der Bauphase",
      "Baufeinreinigung nach Abschluss der Arbeiten",
      "Bauendreinigung vor der Übergabe",
    ],
    audience: "Bauunternehmen, Bauträger und Eigentümer",
    questions:
      "In welcher Bauphase befindet sich das Objekt? Wann ist die Übergabe geplant?",
  },
  {
    slug: "grundreinigung",
    name: "Grund- & Sonderreinigung",
    short: "Gründlich bis ins Detail.",
    icon: "drop",
    tag: "Für besondere Anforderungen",
    description:
      "Wenn die laufende Reinigung nicht ausreicht: intensive Reinigung und besondere Aufgaben, abgestimmt auf Material und Zustand.",
    details: [
      "Intensive Reinigung beanspruchter Flächen",
      "Materialgerechte Behandlung",
      "Objektbezogene Sonderreinigung nach Absprache",
    ],
    audience: "Gewerbe-, Wohn- und Gemeinschaftsflächen",
    questions:
      "Welche Verschmutzungen und Materialien liegen vor? Gibt es besondere Anforderungen?",
  },
  {
    slug: "treppenreinigung",
    name: "Treppenhausreinigung",
    short: "Willkommen auf jeder Etage.",
    icon: "stairs",
    tag: "Für Hausverwaltungen",
    description:
      "Saubere Eingänge und gepflegte Treppenhäuser. Für einen angenehmen Eindruck vom ersten Schritt an.",
    details: [
      "Treppen, Podeste und Eingangsbereiche",
      "Geländer und Kontaktflächen",
      "Regelmäßige Pflege nach vereinbartem Plan",
    ],
    audience: "Hausverwaltungen, Eigentümer und Wohnanlagen",
    questions:
      "Wie viele Aufgänge und Etagen hat Ihr Objekt? Wie häufig wünschen Sie die Reinigung?",
  },
] as const;
export type Service = (typeof services)[number];

export const sectors = [
  ["Büros & Gewerbe", "Arbeitsplätze, Empfang und Gemeinschaftsflächen."],
  [
    "Hausverwaltungen",
    "Treppenhäuser, Eingänge und gemeinschaftlich genutzte Bereiche.",
  ],
  ["Bildung & Betreuung", "Schulen, Kindertagesstätten und Sporthallen."],
  ["Bau & Immobilien", "Reinigung während der Bauphase und vor der Übergabe."],
  ["Handel & Hotellerie", "Gepflegte Flächen für Gäste und Kundschaft."],
  ["Gesundheit & Pflege", "Objektbezogener Reinigungsumfang nach Abstimmung."],
] as const;
