import type { ConstructionLocale } from './construction-offers';

/**
 * Official KNABA partner-list sequence as audited 2026-10-26.
 * GOLDBECK and BONAVA are identified from the two original logo images;
 * the official names/relationships and trademark rights still require
 * customer/rightsholder sign-off before public release.
 * The original five assets come from PR #75. The user confirmed TM Ausbau and
 * Brüninghoff Group on 2026-11-08; their original SVG logos come from the
 * respective official websites. All logo assets load from our own origin.
 */
export const officialPartnerLogos = [
  {id:'official-01', slug:'goldbeck', name:'GOLDBECK', src:'/images/partners/goldbeck.jpg', width:149, height:121,
    source:'https://www.goldbeck.de/unternehmen',
    description:{de:'GOLDBECK plant, baut und betreut Immobilien. Zum Leistungsspektrum gehören unter anderem Industriehallen, Büros, Bildungsbauten, Wohngebäude und gebäudenahe Dienstleistungen.',en:'GOLDBECK designs, builds and services properties. Its work includes industrial buildings, offices, schools, residential buildings and property services.',uk:'GOLDBECK проєктує, будує та обслуговує нерухомість: промислові будівлі, офіси, навчальні заклади й житло. Компанія також надає послуги з обслуговування будівель.',ru:'GOLDBECK проектирует, строит и обслуживает недвижимость: промышленные здания, офисы, учебные заведения и жильё. Компания также оказывает услуги по обслуживанию зданий.'}},
  {id:'official-02', slug:'bonava', name:'BONAVA', src:'/images/partners/bonava.jpg', width:150, height:104,
    source:'https://www.bonava.de/ueber-uns',
    description:{de:'Bonava entwickelt Wohnquartiere, Häuser und Wohnungen. Die Planung verbindet die Gebäude mit ihrem Umfeld und den Bedürfnissen der Menschen, die dort wohnen.',en:'Bonava develops residential neighbourhoods, houses and apartments. Its planning considers both the homes and their surroundings, with attention to the people who will live there.',uk:'Bonava розвиває житлові квартали, будує будинки та квартири. Під час планування враховує навколишнє середовище й потреби майбутніх мешканців.',ru:'Bonava развивает жилые кварталы, строит дома и квартиры. При планировании учитывает окружающую среду и потребности будущих жителей.'}},
  // Official 2024 notice records insolvency applications. Describe historical
  // activity only; do not imply current availability or an active KNABA contract.
  {id:'hit', slug:'hit', name:'HIT · Hanseatische Immobilien Treuhand', src:'/images/partners/hit.png', width:149, height:149,
    source:'https://www.hit-immobilien.de/wp-content/uploads/2024/03/20240308-hit.-Unternehmensgruppe-Pressemitteilung-Insolvenzantraege-HP.pdf',
    description:{de:'Hanseatische Immobilien Treuhand aus Stade ist aus dem Bauträger- und Projektentwicklungsgeschäft bekannt. Das Unternehmensprofil gehört zum Bereich Immobilien und Bauprojekte.',en:'Hanseatische Immobilien Treuhand, based in Stade, is known for its property development activities. Its company background is in real estate and construction projects.',uk:'Hanseatische Immobilien Treuhand зі Штаде відома діяльністю у сфері девелопменту. Профіль компанії пов’язаний із нерухомістю та будівельними проєктами.',ru:'Hanseatische Immobilien Treuhand из Штаде известна деятельностью в сфере девелопмента. Профиль компании связан с недвижимостью и строительными проектами.'}},
  {id:'stromkreis', slug:'stromkreis', name:'Stromkreis', src:'/images/partners/stromkreis.png', width:210, height:42,
    source:'https://www.stromkreis.de/ueber-uns/',
    description:{de:'Stromkreis berät zu Energielösungen für Privat- und Geschäftskunden. Dazu gehören Strom- und Gastarife sowie Beratung zu Photovoltaik und weiteren Energiedienstleistungen.',en:'Stromkreis advises private and business customers on energy solutions, including electricity and gas tariffs, photovoltaics and other energy services.',uk:'Stromkreis консультує приватних і бізнес-клієнтів щодо енергетичних рішень: тарифів на електроенергію та газ, фотоелектричних систем й інших енергопослуг.',ru:'Stromkreis консультирует частных и корпоративных клиентов по энергетическим решениям: тарифам на электричество и газ, фотоэлектрическим системам и другим энергоуслугам.'}},
  {id:'gewobag', slug:'gewobag', name:'Gewobag', src:'/images/partners/gewobag.png', width:168, height:51,
    source:'https://www.gewobag.de/ueber-uns/ueber-die-gewobag/',
    description:{de:'Gewobag ist ein kommunales Wohnungsunternehmen in Berlin. Zu seinen Aufgaben zählen die Bewirtschaftung, der Neubau und die Modernisierung von Wohnraum sowie die Entwicklung von Quartieren.',en:'Gewobag is a municipal housing company in Berlin. Its work covers housing management, new construction, modernisation and neighbourhood development.',uk:'Gewobag — комунальна житлова компанія Берліна. Вона управляє житловим фондом, будує та модернізує житло й розвиває міські квартали.',ru:'Gewobag — муниципальная жилищная компания Берлина. Она управляет жилым фондом, строит и модернизирует жильё, развивает городские кварталы.'}},
  {id:'tm-ausbau', slug:'tm-ausbau', name:'TM Ausbau', src:'/images/partners/tm-ausbau.svg', width:220, height:37,
    source:'https://www.tm-ausbau.eu/', website:'https://www.tm-ausbau.eu/',
    description:{de:'TM Ausbau plant und realisiert Ausbauprojekte. Das Leistungsspektrum umfasst Bauen im Bestand, Innenausbau, Mieterausbau und Möbelbau.',en:'TM Ausbau plans and delivers fit-out projects. Its services include work on existing buildings, interior fit-outs, tenant fit-outs and furniture construction.',uk:'TM Ausbau планує та виконує проєкти облаштування приміщень. Напрями роботи охоплюють реконструкцію наявних будівель, внутрішнє оздоблення, облаштування орендованих приміщень і виготовлення меблів.',ru:'TM Ausbau планирует и реализует проекты обустройства помещений. Направления работы включают реконструкцию существующих зданий, внутреннюю отделку, обустройство арендуемых помещений и изготовление мебели.'}},
  {id:'brueninghoff', slug:'brueninghoff', name:'Brüninghoff Group', src:'/images/partners/brueninghoff-group.svg', width:148, height:29,
    source:'https://www.brueninghoff.de/', website:'https://www.brueninghoff.de/',
    description:{de:'Die Brüninghoff Group plant, produziert und realisiert Gebäude aus Holz, Beton, Metall und hybriden Konstruktionen. Zu ihren Tätigkeitsfeldern gehören Wohnungsbau, Hallenbau und Bürogebäude.',en:'Brüninghoff Group plans, manufactures and constructs buildings using timber, concrete, metal and hybrid structures. Its work includes residential buildings, industrial halls and offices.',uk:'Brüninghoff Group проєктує будівлі, виготовляє конструкції та виконує будівництво з дерева, бетону, металу й гібридних конструкцій. Серед напрямів — житлові, промислові та офісні будівлі.',ru:'Brüninghoff Group проектирует здания, производит конструкции и выполняет строительство из дерева, бетона, металла и гибридных конструкций. Среди направлений — жилые, промышленные и офисные здания.'}},
] as const;

export const partnerCopy: Record<ConstructionLocale, {
  eyebrow:string; title:string; description:string; logo:string; profile:string;
}> = {
  de:{eyebrow:'KnaBa / Netzwerk',title:'Unsere Partner.',description:'Unternehmen aus dem KnaBa-Partnernetzwerk.',logo:'Logo von',profile:'Unternehmen kennenlernen'},
  en:{eyebrow:'KnaBa / Network',title:'Our partners.',description:'Businesses in the KnaBa partner network.',logo:'Logo of',profile:'Meet the company'},
  uk:{eyebrow:'KnaBa / Партнери',title:'Наші партнери.',description:'Компанії партнерської мережі KnaBa.',logo:'Логотип',profile:'Про компанію'},
  ru:{eyebrow:'KnaBa / Партнёры',title:'Наши партнёры.',description:'Компании партнёрской сети KnaBa.',logo:'Логотип',profile:'О компании'},
};

export const partnerDirectoryCopy: Record<ConstructionLocale, {title:string;intro:string;index:string;website:string}> = {
  de:{title:'Unsere Partner im Überblick',intro:'Lernen Sie die Unternehmen aus unserem Partnerbereich und ihre Tätigkeitsfelder kennen.',index:'Unternehmen auf dieser Seite',website:'Offizielle Website'},
  en:{title:'Meet our partners',intro:'Get to know the companies featured in our partner section and their areas of work.',index:'Companies on this page',website:'Official website'},
  uk:{title:'Більше про наших партнерів',intro:'Познайомтеся з компаніями з нашого партнерського розділу та їхніми напрямами діяльності.',index:'Компанії на цій сторінці',website:'Офіційний сайт'},
  ru:{title:'Больше о наших партнёрах',intro:'Познакомьтесь с компаниями из нашего партнёрского раздела и направлениями их деятельности.',index:'Компании на этой странице',website:'Официальный сайт'},
};

export function partnerProfilePath(locale: ConstructionLocale, slug: typeof officialPartnerLogos[number]['slug']): string {
  return (locale === 'de' ? '' : '/' + locale) + '/partner/#' + slug;
}
