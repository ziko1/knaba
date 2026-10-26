import type {ReviewLocale} from './reviews';

/** Helpful enquiry scenarios, NOT testimonials or evidence of completed work. */
type Story = Readonly<{title:string;description:string;action:string;path:string;image:string;alt:string}>;
type StoryGroup = Readonly<{heading:string;intro:string;items:readonly Story[]}>;
const img = {
  handover: '/illustrations/marketing-handover.svg',
  preparation: '/illustrations/marketing-preparation.svg',
  everyday: '/illustrations/marketing-everyday.svg',
} as const;

export const marketingStories = {
  de: {
    heading: 'Das zählt bei Ihrer Anfrage',
    intro: 'Drei Situationen, in denen ein klar vereinbarter Leistungsumfang besonders wichtig ist. Wählen Sie Ihren Ausgangspunkt.',
    items: [
      {title:'Der Übergabetermin rückt näher',description:'Die Räume sind fast fertig, doch einzelne Gewerke arbeiten weiter? Wir klären, welche Bereiche freigegeben sind, welche Oberflächen besondere Pflege brauchen und wann die Reinigung stattfinden soll.',action:'Bauendreinigung planen',path:'bauleistungen/bauendreinigung',image:img.handover,alt:'Illustration eines hellen Innenraums in der Bauendphase'},
      {title:'Auf der Baustelle fehlt eine helfende Hand',description:'Ob Arbeitsbereiche vorbereitet oder Materialien im vereinbarten Umfang bewegt werden sollen: Sagen Sie uns, welche Aufgaben anstehen, welche Zugänge möglich sind und wer vor Ort koordiniert.',action:'Bauhelfer anfragen',path:'bauleistungen/bauhilfe',image:img.preparation,alt:'Illustration von Werkzeug und geschützten Arbeitsbereichen auf einer Baustelle'},
      {title:'Der Betrieb soll ungestört weiterlaufen',description:'Für Büros und gemeinschaftlich genutzte Flächen zählt der Alltag: Welche Räume werden stark genutzt, wann ist Zugang möglich und welche Reinigungsintervalle passen?',action:'Unterhaltsreinigung ansehen',path:'leistungen/unterhaltsreinigung',image:img.everyday,alt:'Illustration eines gepflegten Büroflurs mit Reinigungsgeräten'},
    ],
  },
  en: {
    heading: 'What matters for your enquiry',
    intro: 'Three situations where clearly agreed scope helps you move forward. Start with the one closest to your project.',
    items: [
      {title:'Handover day is approaching',description:'The rooms are nearly ready, but other trades are still working? We can clarify which areas are released, which surfaces need special care and when cleaning should happen.',action:'Plan final cleaning',path:'bauleistungen/bauendreinigung',image:img.handover,alt:'Illustration of a bright interior near the end of construction'},
      {title:'Your site needs an extra pair of hands',description:'Whether work areas need preparing or agreed materials need moving, tell us what needs doing, which access routes are available and who coordinates work on site.',action:'Enquire about site support',path:'bauleistungen/bauhilfe',image:img.preparation,alt:'Illustration of tools and protected working areas at a construction site'},
      {title:'Business needs to carry on as usual',description:'For offices and shared spaces, daily routines matter. Which rooms see the most use, when can cleaning take place and how often is it needed?',action:'Explore routine cleaning',path:'leistungen/unterhaltsreinigung',image:img.everyday,alt:'Illustration of a clean office corridor with cleaning equipment'},
    ],
  },
  uk: {
    heading: 'Що важливо для вашого запиту',
    intro: 'Три типові ситуації, коли чітко погоджений обсяг робіт допомагає уникнути непорозумінь. Оберіть свою.',
    items: [
      {title:'Наближається здача об’єкта',description:'Приміщення майже готові, але окремі підрядники ще працюють? Уточнимо, які зони вже доступні, які поверхні потребують особливого догляду та коли доречно проводити прибирання.',action:'Запланувати фінальне прибирання',path:'bauleistungen/bauendreinigung',image:img.handover,alt:'Ілюстрація світлого приміщення на завершальному етапі будівництва'},
      {title:'На будмайданчику потрібна допомога',description:'Треба підготувати робочі зони або перемістити матеріали в погоджених межах? Повідомте, які завдання стоять, як організований доступ і хто координує роботи на об’єкті.',action:'Замовити будівельних помічників',path:'bauleistungen/bauhilfe',image:img.preparation,alt:'Ілюстрація інструментів і захищених робочих зон на будмайданчику'},
      {title:'Офіс має працювати у звичному ритмі',description:'Для офісів і спільних приміщень важливий щоденний розклад. Які кімнати використовуються найчастіше, коли можливий доступ і як часто потрібно прибирати?',action:'Дізнатися про регулярне прибирання',path:'leistungen/unterhaltsreinigung',image:img.everyday,alt:'Ілюстрація охайного офісного коридору з прибиральним обладнанням'},
    ],
  },
  ru: {
    heading: 'Что важно для вашего запроса',
    intro: 'Три ситуации, когда заранее согласованный объём работ помогает избежать недоразумений. Выберите свою.',
    items: [
      {title:'Приближается сдача объекта',description:'Помещения почти готовы, но отдельные подрядчики ещё работают? Уточним, какие зоны уже доступны, каким поверхностям нужен особый уход и когда лучше проводить уборку.',action:'Спланировать финальную уборку',path:'bauleistungen/bauendreinigung',image:img.handover,alt:'Иллюстрация светлого помещения на завершающем этапе строительства'},
      {title:'На стройплощадке нужна помощь',description:'Нужно подготовить рабочие зоны или переместить материалы в согласованных пределах? Расскажите о задачах, доступе и том, кто координирует работы на объекте.',action:'Узнать о строительных помощниках',path:'bauleistungen/bauhilfe',image:img.preparation,alt:'Иллюстрация инструментов и защищённых рабочих зон на стройплощадке'},
      {title:'Офис должен работать как обычно',description:'Для офисов и общих помещений важен ежедневный график. Какие комнаты используют чаще всего, когда возможен доступ и как часто нужна уборка?',action:'Посмотреть регулярную уборку',path:'leistungen/unterhaltsreinigung',image:img.everyday,alt:'Иллюстрация ухоженного офисного коридора с уборочным оборудованием'},
    ],
  },
} as const satisfies Record<ReviewLocale, StoryGroup>;
