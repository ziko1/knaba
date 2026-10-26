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
      {title:'Zwischen den Gewerken muss Platz bleiben',description:'Wenn auf der Baustelle mehrere Gewerke nacheinander arbeiten, bleiben Staub und lose Reste zurück. Wir klären, welche Bereiche zugänglich sind, welche Arbeiten schon abgeschlossen wurden und wann eine Zwischenreinigung hilft.',action:'Bauzwischenreinigung ansehen',path:'bauleistungen/bauzwischenreinigung',image:img.everyday,alt:'Illustration eines gepflegten Innenbereichs mit Reinigungsgeräten zwischen Bauphasen'},
    ],
  },
  en: {
    heading: 'What matters for your enquiry',
    intro: 'Three situations where clearly agreed scope helps you move forward. Start with the one closest to your project.',
    items: [
      {title:'Handover day is approaching',description:'The rooms are nearly ready, but other trades are still working? We can clarify which areas are released, which surfaces need special care and when cleaning should happen.',action:'Plan final cleaning',path:'bauleistungen/bauendreinigung',image:img.handover,alt:'Illustration of a bright interior near the end of construction'},
      {title:'Your site needs an extra pair of hands',description:'Whether work areas need preparing or agreed materials need moving, tell us what needs doing, which access routes are available and who coordinates work on site.',action:'Enquire about site support',path:'bauleistungen/bauhilfe',image:img.preparation,alt:'Illustration of tools and protected working areas at a construction site'},
      {title:'Keep work areas ready for the next trade',description:'Dust and loose material build up when several trades work in sequence. Let us know which areas are accessible, which tasks are finished and when an interim clean would best fit the site schedule.',action:'Explore interim cleaning',path:'bauleistungen/bauzwischenreinigung',image:img.everyday,alt:'Illustration of a tidy indoor work area with cleaning equipment between construction stages'},
    ],
  },
  uk: {
    heading: 'Що важливо для вашого запиту',
    intro: 'Три типові ситуації, коли чітко погоджений обсяг робіт допомагає уникнути непорозумінь. Оберіть свою.',
    items: [
      {title:'Наближається здача об’єкта',description:'Приміщення майже готові, але окремі підрядники ще працюють? Уточнимо, які зони вже доступні, які поверхні потребують особливого догляду та коли доречно проводити прибирання.',action:'Запланувати фінальне прибирання',path:'bauleistungen/bauendreinigung',image:img.handover,alt:'Ілюстрація світлого приміщення на завершальному етапі будівництва'},
      {title:'На будмайданчику потрібна допомога',description:'Треба підготувати робочі зони або перемістити матеріали в погоджених межах? Повідомте, які завдання стоять, як організований доступ і хто координує роботи на об’єкті.',action:'Замовити будівельних помічників',path:'bauleistungen/bauhilfe',image:img.preparation,alt:'Ілюстрація інструментів і захищених робочих зон на будмайданчику'},
      {title:'Робочі зони мають бути готовими до наступного етапу',description:'Коли на будмайданчику послідовно працюють різні підрядники, накопичуються пил і залишки матеріалів. Уточнимо, які ділянки доступні, що вже завершено та коли міжетапне прибирання буде доречним.',action:'Переглянути міжетапне прибирання',path:'bauleistungen/bauzwischenreinigung',image:img.everyday,alt:'Ілюстрація прибраного приміщення між будівельними етапами з клінінговим обладнанням'},
    ],
  },
  ru: {
    heading: 'Что важно для вашего запроса',
    intro: 'Три ситуации, когда заранее согласованный объём работ помогает избежать недоразумений. Выберите свою.',
    items: [
      {title:'Приближается сдача объекта',description:'Помещения почти готовы, но отдельные подрядчики ещё работают? Уточним, какие зоны уже доступны, каким поверхностям нужен особый уход и когда лучше проводить уборку.',action:'Спланировать финальную уборку',path:'bauleistungen/bauendreinigung',image:img.handover,alt:'Иллюстрация светлого помещения на завершающем этапе строительства'},
      {title:'На стройплощадке нужна помощь',description:'Нужно подготовить рабочие зоны или переместить материалы в согласованных пределах? Расскажите о задачах, доступе и том, кто координирует работы на объекте.',action:'Узнать о строительных помощниках',path:'bauleistungen/bauhilfe',image:img.preparation,alt:'Иллюстрация инструментов и защищённых рабочих зон на стройплощадке'},
      {title:'Рабочие зоны должны быть готовы к следующему этапу',description:'Когда на стройплощадке по очереди работают разные подрядчики, накапливаются пыль и остатки материалов. Уточним доступные участки, завершённые работы и время промежуточной уборки.',action:'Посмотреть промежуточную уборку',path:'bauleistungen/bauzwischenreinigung',image:img.everyday,alt:'Иллюстрация убранного помещения с клининговым оборудованием между этапами строительства'},
    ],
  },
} as const satisfies Record<ReviewLocale, StoryGroup>;
