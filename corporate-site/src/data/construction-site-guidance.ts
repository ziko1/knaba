import {extraGuidance} from './construction-guidance-extra';
import type {NeedChoice, ObjectChoice} from '../lib/planner';
import type {PublicLocale} from '../lib/public-i18n';

type Text = Readonly<Record<PublicLocale, string>>;
const T = (de:string,en:string,uk:string,ru:string):Text => ({de,en,pl:extraGuidance[en][0],lt:extraGuidance[en][1],ru,uk});

// Enquiry preparation, not a specification or a promise of technical execution.
const objectPreparation:Readonly<Record<ObjectChoice, readonly Text[]>> = {
  office: [
    T('Nutzungszeiten und belegte Büro- oder Verkaufsbereiche nennen; mögliche Reinigungsfenster abstimmen.', 'List operating hours and occupied office or retail areas; agree possible cleaning windows.', 'Укажіть години роботи й зайняті офісні або торгові зони; погодьте можливий час прибирання.', 'Укажите часы работы и занятые офисные или торговые зоны; согласуйте возможное время уборки.'),
    T('Möblierung, empfindliche Oberflächen und Räume mit eingeschränktem Zugang im Flächenplan markieren.', 'Mark furniture, sensitive surfaces and rooms with restricted access on the area plan.', 'Позначте на плані меблі, делікатні поверхні й приміщення з обмеженим доступом.', 'Отметьте на плане мебель, чувствительные поверхности и помещения с ограниченным доступом.'),
  ],
  housing: [
    T('Bewohnte und freie Wohnungen sowie gemeinsam genutzte Treppen und Wege getrennt angeben.', 'Distinguish occupied and vacant homes, shared stairways and access routes.', 'Окремо вкажіть заселені й вільні квартири, спільні сходи та проходи.', 'Отдельно укажите заселённые и свободные квартиры, общие лестницы и проходы.'),
    T('Schlüsselübergabe, Etagen, Aufzug und geplante Einzugstermine mit einer Kontaktperson abstimmen.', 'Agree keys, floors, lift access and planned move-in dates with a named contact.', 'Узгодьте з контактною особою передачу ключів, поверхи, доступ до ліфта й дати заселення.', 'Согласуйте с контактным лицом передачу ключей, этажи, доступ к лифту и даты заселения.'),
  ],
  construction: [
    T('Bauabschnitte und freigegebene Räume auflisten; laufende und nachfolgende Gewerke dazuschreiben.', 'List construction sections and released rooms, including current and subsequent trades.', 'Перелічіть будівельні ділянки й доступні приміщення, поточні та наступні роботи підрядників.', 'Перечислите строительные участки и доступные помещения, текущие и последующие работы подрядчиков.'),
    T('Materiallager, Anlieferwege und gewünschte Abschnittstermine mit der Bauleitung abstimmen.', 'Coordinate material storage, delivery routes and preferred dates for each section with site management.', 'Узгодьте з керівником об’єкта місця зберігання матеріалів, маршрути постачання й строки окремих етапів.', 'Согласуйте с руководителем объекта места хранения материалов, пути доставки и сроки отдельных этапов.'),
  ],
  education: [
    T('Betroffene Technikräume, Einbauten und zugängliche Oberflächen beschreiben; zuständige Ansprechperson nennen.', 'Describe affected plant rooms, installed equipment and accessible surfaces; name the responsible contact.', 'Опишіть технічні приміщення, встановлене обладнання й доступні поверхні; вкажіть відповідальну особу.', 'Опишите технические помещения, установленное оборудование и доступные поверхности; укажите ответственное лицо.'),
    T('Reinigung und technische Ausführung getrennt anfragen. Bohrungen, Durchführungen und Leitungsarbeiten sind kein Bestandteil dieser Reinigungsauswahl.', 'Enquire about cleaning and technical work separately. Drilling, service openings and work on utilities are not included in this cleaning selection.', 'Запитуйте клінінг і технічні роботи окремо. Буріння, проходки та роботи з мережами не входять до цього вибору прибирання.', 'Запрашивайте клининг и технические работы отдельно. Бурение, проходки и работы с коммуникациями не входят в этот выбор уборки.'),
  ],
};

const phasePreparation:Readonly<Record<NeedChoice, Text>> = {
  routine:T('Für die Zwischenreinigung: den nächsten Arbeitsschritt und mögliche wiederkehrende Zeitfenster nennen.', 'For interim cleaning: state the next work stage and possible recurring time slots.', 'Для міжетапного прибирання: вкажіть наступні роботи й можливий графік повторних виїздів.', 'Для промежуточной уборки: укажите следующие работы и возможный график повторных выездов.'),
  glass:T('Für die Feinreinigung: fertige Oberflächen, Materialien und sichtbare Rückstände beschreiben.', 'For fine cleaning: describe finished surfaces, their materials and visible residues.', 'Для тонкого прибирання: опишіть готові поверхні, їхні матеріали й видимі залишки.', 'Для тонкой уборки: опишите готовые поверхности, их материалы и видимые остатки.'),
  intensive:T('Für die Beräumung: Materialarten, ungefähre Mengen und Lagerorte nennen; Abtransport separat abstimmen.', 'For clearance: list material types, approximate quantities and storage locations; agree removal separately.', 'Для розчищення: вкажіть матеріали, приблизні обсяги й місця зберігання; вивезення погодьте окремо.', 'Для расчистки: укажите материалы, примерные объёмы и места хранения; вывоз согласуйте отдельно.'),
  handover:T('Für die Endreinigung: Übergabetermin, noch offene Restarbeiten und die Räume für die gemeinsame Sichtkontrolle nennen.', 'For final cleaning: give the handover date, outstanding work and rooms for a joint visual check.', 'Для фінального прибирання: вкажіть дату здачі, незавершені роботи й приміщення для спільного огляду.', 'Для финальной уборки: укажите дату сдачи, незавершённые работы и помещения для совместного осмотра.'),
};
const heading=T('Für Ihr Objekt vorbereiten', 'Prepare for your property', 'Підготуйте для свого об’єкта', 'Подготовьте для своего объекта');
const relatedLabel=T('Technische Zusatzarbeiten ansehen', 'Explore technical work', 'Переглянути технічні роботи', 'Посмотреть технические работы');

export function getFinderGuidance(object:unknown,need:unknown,locale:PublicLocale='de') {
  const objectKey=typeof object==='string' && Object.hasOwn(objectPreparation,object)?object as ObjectChoice:'construction';
  const needKey=typeof need==='string' && Object.hasOwn(phasePreparation,need)?need as NeedChoice:'handover';
  return {
    heading:heading[locale],
    items:objectPreparation[objectKey].map(item=>item[locale]),
    phase:phasePreparation[needKey][locale],
    related:objectKey==='education'?{path:`${locale==='de'?'':'/'+locale}/leistungen/#zusatzarbeiten`,label:relatedLabel[locale]}:null,
  };
}
