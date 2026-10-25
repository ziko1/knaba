/** Public, source-reviewed marketing FAQ. No fixed-price, qualifications or bookings are promised. */
import type { ConstructionLocale } from "./construction-offers";
export type FaqTranslation = Readonly<Record<ConstructionLocale, string>>;
export interface FaqEntry { readonly id: string; readonly question: FaqTranslation; readonly answer: FaqTranslation; }
export interface FaqGroup { readonly id: string; readonly title: FaqTranslation; readonly items: readonly FaqEntry[]; }
export const constructionFaq: readonly FaqGroup[] = [
  {
    "id": "general",
    "title": {
      "de": "Allgemeines & Kontakt",
      "en": "General enquiries",
      "uk": "Загальні питання",
      "ru": "Общие вопросы"
    },
    "items": [
      {
        "id": "stages",
        "question": {
          "de": "Welche Bauphasen begleitet KnaBa?",
          "en": "Which construction phases can KnaBa support?",
          "uk": "Які етапи будівництва супроводжує KnaBa?",
          "ru": "Какие этапы строительства сопровождает KnaBa?"
        },
        "answer": {
          "de": "Je nach Auftrag sind Baugrob-, Zwischen-, Fein- und Endreinigung möglich. Die Einsatzphasen vereinbaren wir passend zum Bauablauf.",
          "en": "Depending on the project, rough, interim, fine and final cleaning can be agreed around the construction schedule.",
          "uk": "Залежно від проєкту можна узгодити грубе, міжетапне, тонке й фінальне прибирання за графіком будівництва.",
          "ru": "В зависимости от проекта можно согласовать черновую, промежуточную, тонкую и финальную уборку по графику строительства."
        }
      },
      {
        "id": "region",
        "question": {
          "de": "Wo ist KnaBa tätig?",
          "en": "Where does KnaBa operate?",
          "uk": "Де працює KnaBa?",
          "ru": "В каких регионах работает KnaBa?"
        },
        "answer": {
          "de": "Unser Schwerpunkt ist Berlin und Brandenburg. Den konkreten Standort und die Erreichbarkeit prüfen wir vor einer Zusage.",
          "en": "Our focus is Berlin and Brandenburg. We check the exact location and access before confirming a project.",
          "uk": "Основний регіон — Берлін і Бранденбург. Конкретну адресу та доступність перевіряємо до підтвердження.",
          "ru": "Основной регион — Берлин и Бранденбург. Конкретный адрес и доступность проверяем до подтверждения."
        }
      },
      {
        "id": "single",
        "question": {
          "de": "Kann ich nur eine einzelne Leistung anfragen?",
          "en": "Can I request just one service?",
          "uk": "Чи можна замовити лише одну послугу?",
          "ru": "Можно ли запросить только одну услугу?"
        },
        "answer": {
          "de": "Ja. Sie können beispielsweise nur eine Bauzwischenreinigung oder eine einzelne Zusatzarbeit anfragen. Ob sie ausgeführt werden kann, klären wir vor Vertragsschluss.",
          "en": "Yes. You can enquire about a single cleaning phase or an additional task. Feasibility is assessed before any agreement.",
          "uk": "Так. Можна звернутися лише щодо одного етапу прибирання чи додаткової роботи. Можливість виконання узгоджується до договору.",
          "ru": "Да. Можно запросить только один этап уборки или дополнительную работу. Возможность выполнения согласуется до договора."
        }
      },
      {
        "id": "private",
        "question": {
          "de": "Können auch private Bauherren anfragen?",
          "en": "Can private property owners enquire?",
          "uk": "Чи можуть звертатися приватні власники?",
          "ru": "Могут ли обратиться частные владельцы?"
        },
        "answer": {
          "de": "Ja, auch ein einzelnes Bau- oder Sanierungsprojekt kann angefragt werden. Ob Umfang und Termin passen, wird individuell geprüft.",
          "en": "Yes, individual building and renovation projects can be enquired about. Scope and availability are reviewed case by case.",
          "uk": "Так, можна звернутися з окремим будівельним проєктом чи ремонтом. Обсяг і доступність узгоджуються індивідуально.",
          "ru": "Да, можно обратиться с отдельным строительным проектом или ремонтом. Объём и доступность согласуются индивидуально."
        }
      },
      {
        "id": "b2b",
        "question": {
          "de": "Arbeitet KnaBa mit Generalunternehmern zusammen?",
          "en": "Does KnaBa work with general contractors?",
          "uk": "Чи співпрацює KnaBa з генпідрядниками?",
          "ru": "Сотрудничает ли KnaBa с генподрядчиками?"
        },
        "answer": {
          "de": "Bauunternehmen, Generalunternehmer und Projektverantwortliche können Reinigungs- und Bauhilfsleistungen für definierte Bauabschnitte anfragen.",
          "en": "Construction firms, main contractors and project managers can enquire about defined cleaning and site-support packages.",
          "uk": "Будівельні компанії, генпідрядники та керівники проєктів можуть узгодити клінінг і допоміжні роботи для конкретних етапів.",
          "ru": "Строительные компании, генподрядчики и руководители проектов могут согласовать клининг и подсобные работы для конкретных этапов."
        }
      },
      {
        "id": "photos",
        "question": {
          "de": "Reichen Fotos für eine erste Anfrage?",
          "en": "Are photographs enough for an initial enquiry?",
          "uk": "Чи достатньо фотографій для першого запиту?",
          "ru": "Достаточно ли фотографий для первого обращения?"
        },
        "answer": {
          "de": "Fotos, Maße und eine kurze Beschreibung helfen bei der Ersteinschätzung. Für eine verbindliche Ausführung können Pläne oder ein Ortstermin erforderlich sein.",
          "en": "Photos, measurements and a short description help with an initial review. Plans or a site visit may be needed before confirmation.",
          "uk": "Фото, розміри та короткий опис допоможуть оцінити завдання. Перед підтвердженням можуть знадобитися креслення або огляд.",
          "ru": "Фото, размеры и краткое описание помогут оценить задачу. Перед подтверждением могут потребоваться чертежи или осмотр."
        }
      },
      {
        "id": "contact",
        "question": {
          "de": "Wie stelle ich eine Projektanfrage?",
          "en": "How do I submit a project enquiry?",
          "uk": "Як надіслати запит щодо проєкту?",
          "ru": "Как отправить заявку по проекту?"
        },
        "answer": {
          "de": "Über das Kontaktformular oder telefonisch. Nennen Sie Ort, Bauphase, Flächen, gewünschte Arbeiten und Zeitraum; eine Anfrage ist noch keine Buchung.",
          "en": "Use the contact form or phone. Include the site, construction phase, area, tasks and timeframe; an enquiry is not a booking.",
          "uk": "Через контактну форму або телефоном. Вкажіть адресу, етап, площу, роботи та бажаний строк; запит не є бронюванням.",
          "ru": "Через контактную форму или по телефону. Укажите адрес, этап, площадь, работы и сроки; заявка не является бронированием."
        }
      }
    ]
  },
  {
    "id": "cleaning",
    "title": {
      "de": "Baureinigung & Übergabe",
      "en": "Construction cleaning",
      "uk": "Будівельний клінінг",
      "ru": "Строительный клининг"
    },
    "items": [
      {
        "id": "rough",
        "question": {
          "de": "Was gehört zur Baugrobreinigung?",
          "en": "What is rough construction cleaning?",
          "uk": "Що входить у грубе будівельне прибирання?",
          "ru": "Что входит в черновую строительную уборку?"
        },
        "answer": {
          "de": "Typisch sind das Entfernen loser Verschmutzungen und das Freihalten vereinbarter Arbeitsbereiche. Art und Menge von Bauabfällen werden gesondert geklärt.",
          "en": "It usually covers loose dirt and agreed work areas. Construction waste type and volume require separate agreement.",
          "uk": "Зазвичай це видалення вільного бруду й прибирання погоджених робочих зон. Будівельні відходи узгоджуються окремо.",
          "ru": "Обычно это удаление свободной грязи и уборка согласованных рабочих зон. Строительные отходы согласуются отдельно."
        }
      },
      {
        "id": "interim",
        "question": {
          "de": "Wann ist eine Bauzwischenreinigung sinnvoll?",
          "en": "When is interim construction cleaning useful?",
          "uk": "Коли потрібне міжетапне прибирання?",
          "ru": "Когда нужна промежуточная уборка?"
        },
        "answer": {
          "de": "Zwischen Gewerken oder vor Folgearbeiten kann die Reinigung Staub und Schmutz reduzieren. Der Zeitpunkt wird mit der Bauleitung abgestimmt.",
          "en": "Cleaning between trades or before the next stage can reduce dust and dirt. Timing is coordinated with site management.",
          "uk": "Між роботами підрядників або перед наступним етапом вона допомагає прибрати пил і бруд. Час узгоджується з керівником будівництва.",
          "ru": "Между работами подрядчиков или перед следующим этапом она помогает убрать пыль и грязь. Время согласуется с руководителем стройки."
        }
      },
      {
        "id": "fine",
        "question": {
          "de": "Was unterscheidet Baufein- und Bauendreinigung?",
          "en": "What is the difference between fine and final cleaning?",
          "uk": "Чим відрізняються тонке й фінальне прибирання?",
          "ru": "Чем отличаются тонкая и финальная уборка?"
        },
        "answer": {
          "de": "Die Feinreinigung behandelt Oberflächen detaillierter. Die Endreinigung orientiert sich am vereinbarten Zustand vor Abnahme oder Übergabe.",
          "en": "Fine cleaning addresses surfaces in greater detail. Final cleaning follows the agreed condition for inspection or handover.",
          "uk": "Тонке прибирання передбачає ретельніше очищення поверхонь. Фінальне готує об’єкт до приймання за погодженим переліком.",
          "ru": "Тонкая уборка предполагает более тщательную очистку поверхностей. Финальная готовит объект к приёмке по согласованному перечню."
        }
      },
      {
        "id": "beforehandover",
        "question": {
          "de": "Kann die Reinigung direkt vor der Übergabe stattfinden?",
          "en": "Can cleaning take place before handover?",
          "uk": "Чи можливе прибирання безпосередньо перед здачею?",
          "ru": "Возможна ли уборка непосредственно перед сдачей?"
        },
        "answer": {
          "de": "Das ist ein häufiger Anwendungsfall. Der Abnahmetermin, verbleibende Gewerke und ein ausreichendes Zeitfenster müssen vorab abgestimmt sein.",
          "en": "This is a common use case. Inspection dates, remaining trades and a sufficient time window should be agreed in advance.",
          "uk": "Таке часто потрібно. Заздалегідь слід узгодити дату приймання, залишкові роботи та достатній час.",
          "ru": "Это частая задача. Заранее нужно согласовать дату приёмки, оставшиеся работы и достаточное время."
        }
      },
      {
        "id": "surfaces",
        "question": {
          "de": "Werden Böden, Türen und Sanitärräume gereinigt?",
          "en": "Can floors, doors and washrooms be cleaned?",
          "uk": "Чи прибирають підлогу, двері та санвузли?",
          "ru": "Убирают ли полы, двери и санузлы?"
        },
        "answer": {
          "de": "Diese Flächen können Teil einer Baufein- oder Endreinigung sein. Materialien, Zustand und gewünschte Einzelleistungen gehören ins Leistungsverzeichnis.",
          "en": "These surfaces can be included in fine or final cleaning. Materials, condition and specific tasks belong in the agreed scope.",
          "uk": "Такі поверхні можна включити до тонкого чи фінального прибирання. Матеріали, стан і конкретні роботи фіксуються в обсязі послуг.",
          "ru": "Такие поверхности можно включить в тонкую или финальную уборку. Материалы, состояние и работы фиксируются в объёме услуг."
        }
      },
      {
        "id": "glass",
        "question": {
          "de": "Reinigen Sie auch Glasflächen und Rahmen?",
          "en": "Can glass and window frames be included?",
          "uk": "Чи можна включити скло та віконні рами?",
          "ru": "Можно ли включить стекло и оконные рамы?"
        },
        "answer": {
          "de": "Ja, soweit die Flächen zugänglich und geeignete Verfahren vereinbart sind. Arbeiten in der Höhe bedürfen einer gesonderten Sicherheitsprüfung.",
          "en": "Yes, where surfaces are accessible and suitable methods are agreed. Work at height requires a separate safety review.",
          "uk": "Так, якщо є безпечний доступ і погоджений метод. Роботи на висоті потребують окремої перевірки безпеки.",
          "ru": "Да, если есть безопасный доступ и согласованный метод. Высотные работы требуют отдельной проверки безопасности."
        }
      },
      {
        "id": "residues",
        "question": {
          "de": "Können Kleber-, Farb- und Mörtelreste entfernt werden?",
          "en": "Can adhesive, paint or mortar marks be removed?",
          "uk": "Чи видаляють залишки клею, фарби або розчину?",
          "ru": "Удаляют ли остатки клея, краски или раствора?"
        },
        "answer": {
          "de": "Bitte geben Sie Material und Verschmutzung an. Wir prüfen zunächst, ob eine materialverträgliche Entfernung ohne Schäden möglich ist.",
          "en": "Please specify the surface and residue. We first assess whether removal is possible without damage.",
          "uk": "Вкажіть матеріал поверхні й тип забруднення. Спочатку перевіряють, чи можна видалити його без пошкоджень.",
          "ru": "Укажите материал поверхности и тип загрязнения. Сначала проверяют, можно ли удалить его без повреждений."
        }
      }
    ]
  },
  {
    "id": "site",
    "title": {
      "de": "Bauhelfer & Baustellenservice",
      "en": "Site support & clearance",
      "uk": "Будівельні помічники та майданчик",
      "ru": "Стройпомощники и площадка"
    },
    "items": [
      {
        "id": "bauhelfer",
        "question": {
          "de": "Was machen Bauhelfer bei KnaBa?",
          "en": "What do KnaBa site helpers do?",
          "uk": "Що роблять будівельні помічники KnaBa?",
          "ru": "Чем занимаются строительные помощники KnaBa?"
        },
        "answer": {
          "de": "Vereinbarte Hilfstätigkeiten und Baustellenvorbereitung können Bauunternehmen unterstützen. Konkrete Aufgaben, Aufsicht und Zuständigkeit werden vertraglich festgelegt.",
          "en": "Agreed auxiliary tasks and preparation can support construction firms. Duties, supervision and responsibilities are set out in the contract.",
          "uk": "Допоміжні роботи й підготовка майданчика можуть підтримувати підрядників. Завдання, нагляд і відповідальність визначаються договором.",
          "ru": "Подсобные работы и подготовка площадки могут поддерживать подрядчиков. Задачи, надзор и ответственность определяются договором."
        }
      },
      {
        "id": "prepare",
        "question": {
          "de": "Übernimmt KnaBa die Baustellenvorbereitung?",
          "en": "Can KnaBa help prepare a building site?",
          "uk": "Чи допомагає KnaBa готувати будмайданчик?",
          "ru": "Помогает ли KnaBa подготовить стройплощадку?"
        },
        "answer": {
          "de": "Die Vorbereitung von Arbeitsbereichen kann angefragt werden. Benötigte Geräte, Zugänge, Sicherheitsmaßnahmen und Grenzen werden vorab festgelegt.",
          "en": "Preparing agreed work areas can be requested. Equipment, access, safety measures and limits are defined in advance.",
          "uk": "Можна запитати підготовку погоджених робочих зон. Обладнання, доступ, безпека й межі робіт визначаються наперед.",
          "ru": "Можно запросить подготовку согласованных рабочих зон. Оборудование, доступ, безопасность и границы работ определяются заранее."
        }
      },
      {
        "id": "support",
        "question": {
          "de": "Können Bauhelfer andere Gewerke unterstützen?",
          "en": "Can site helpers support other trades?",
          "uk": "Чи можуть помічники підтримувати інших підрядників?",
          "ru": "Могут ли помощники поддерживать другие бригады?"
        },
        "answer": {
          "de": "Ja, bei klar beschriebenen unterstützenden Tätigkeiten. Fach- und zulassungspflichtige Arbeiten dürfen dadurch nicht ersetzt werden.",
          "en": "Yes, for clearly defined auxiliary activities. This does not replace licensed or specialist trade work.",
          "uk": "Так, у межах чітко визначених допоміжних завдань. Це не замінює роботи ліцензованих спеціалістів.",
          "ru": "Да, в рамках чётко определённых подсобных задач. Это не заменяет работу лицензированных специалистов."
        }
      },
      {
        "id": "clear",
        "question": {
          "de": "Ist die Baustellenberäumung eine eigene Leistung?",
          "en": "Is site clearance a separate service?",
          "uk": "Чи можна окремо замовити звільнення будмайданчика?",
          "ru": "Можно ли отдельно заказать расчистку стройплощадки?"
        },
        "answer": {
          "de": "Ja, das Freiräumen von Bereichen und Sortieren geeigneter Materialreste kann getrennt angefragt werden.",
          "en": "Yes, clearing work areas and sorting suitable material remnants can be requested separately.",
          "uk": "Так, звільнення робочих зон і сортування відповідних матеріалів можна запросити окремо.",
          "ru": "Да, освобождение рабочих зон и сортировку подходящих материалов можно запросить отдельно."
        }
      },
      {
        "id": "waste",
        "question": {
          "de": "Ist die Entsorgung von Bauschutt inklusive?",
          "en": "Is construction waste disposal included?",
          "uk": "Чи включене вивезення будівельного сміття?",
          "ru": "Включён ли вывоз строительного мусора?"
        },
        "answer": {
          "de": "Nein, nicht automatisch. Abfallart, Transport, zulässiger Entsorger und Kosten müssen ausdrücklich vereinbart werden.",
          "en": "Not automatically. Waste type, transport, authorised disposal contractor and costs need explicit agreement.",
          "uk": "Не автоматично. Тип відходів, перевезення, уповноважений утилізатор і вартість узгоджуються окремо.",
          "ru": "Не автоматически. Вид отходов, перевозка, разрешённый подрядчик и стоимость согласуются отдельно."
        }
      },
      {
        "id": "extra",
        "question": {
          "de": "Welche zusätzlichen Bauarbeiten sind möglich?",
          "en": "Which additional construction tasks can be requested?",
          "uk": "Які додаткові будівельні роботи можна запитати?",
          "ru": "Какие дополнительные строительные работы можно запросить?"
        },
        "answer": {
          "de": "Etwa Montage-, Betonbearbeitungs- oder Abbruchanfragen können geprüft werden. Ausführung und fachliche Zuständigkeit stehen erst nach technischer und rechtlicher Klärung fest.",
          "en": "Enquiries for assembly, concrete work or removal tasks may be reviewed. Performance and responsible specialists are confirmed only after technical and legal checks.",
          "uk": "Можна запитати монтажні, бетонні чи демонтажні роботи. Виконавець і можливість виконання визначаються після технічної та правової перевірки.",
          "ru": "Можно запросить монтажные, бетонные или демонтажные работы. Исполнитель и возможность выполнения определяются после технической и правовой проверки."
        }
      },
      {
        "id": "combine",
        "question": {
          "de": "Kann ich Bauhilfe und Reinigung kombinieren?",
          "en": "Can site support and cleaning be combined?",
          "uk": "Чи можна поєднати будівельні роботи та клінінг?",
          "ru": "Можно ли совместить строительные работы и клининг?"
        },
        "answer": {
          "de": "Ja, wenn Umfang, Verantwortlichkeiten und Bauzeiten zusammenpassen. Das Angebot führt die vereinbarten Leistungen getrennt auf.",
          "en": "Yes, if scope, responsibilities and timing align. The quotation should distinguish each agreed task.",
          "uk": "Так, якщо збігаються обсяг, відповідальність і графік. У пропозиції роботи слід зазначити окремо.",
          "ru": "Да, если совпадают объём, ответственность и график. В предложении работы стоит указать отдельно."
        }
      }
    ]
  },
  {
    "id": "drilling",
    "title": {
      "de": "Kernbohrungen & Spezialarbeiten",
      "en": "Drilling & specialist requests",
      "uk": "Буріння та спеціальні роботи",
      "ru": "Бурение и спецработы"
    },
    "items": [
      {
        "id": "direct",
        "question": {
          "de": "Führt KnaBa Kernbohrungen selbst aus?",
          "en": "Does KnaBa itself perform core drilling?",
          "uk": "Чи KnaBa самостійно виконує кернове буріння?",
          "ru": "Выполняет ли KnaBa алмазное бурение самостоятельно?"
        },
        "answer": {
          "de": "Kernbohrungen sind als Anfrage möglich. Eine eigene Ausführung oder ein konkreter Partner ist nicht pauschal zugesagt; Qualifikation, Tragwerk, Leitungen und Genehmigungen sind vor Beauftragung zu klären.",
          "en": "Core drilling can be enquired about. In-house work or a particular partner is not guaranteed; qualifications, structure, utilities and approvals must first be checked.",
          "uk": "Запит на буріння можливий. Власне виконання чи конкретний партнер не гарантуються; перед договором перевіряють кваліфікацію, конструкції, комунікації та дозволи.",
          "ru": "Запрос на бурение возможен. Собственное выполнение или конкретный партнёр не гарантируются; до договора проверяют квалификацию, конструкции, коммуникации и разрешения."
        }
      },
      {
        "id": "pipes",
        "question": {
          "de": "Sind Durchführungen für Rohre und Kabel möglich?",
          "en": "Can openings for pipes and cables be requested?",
          "uk": "Чи можна замовити проходки для труб і кабелів?",
          "ru": "Можно ли заказать отверстия для труб и кабелей?"
        },
        "answer": {
          "de": "Ja, als technische Anfrage mit Angabe von Zweck, Wandaufbau, Durchmesser und Plänen. Eine Freigabe der Ausführung erfolgt erst nach Prüfung.",
          "en": "Yes, as a technical enquiry stating purpose, wall type, diameter and drawings. Work is approved only after assessment.",
          "uk": "Так, як технічний запит із призначенням, матеріалом стіни, діаметром і кресленнями. Виконання підтверджують лише після перевірки.",
          "ru": "Да, как технический запрос с назначением, материалом стены, диаметром и чертежами. Работы подтверждают только после проверки."
        }
      },
      {
        "id": "diameter",
        "question": {
          "de": "Welche Bohrdurchmesser sind möglich?",
          "en": "Which drilling diameters are available?",
          "uk": "Які діаметри буріння можливі?",
          "ru": "Какие диаметры бурения доступны?"
        },
        "answer": {
          "de": "Es gibt keine pauschal zugesagte Durchmesserliste. Bitte nennen Sie Maß, Tiefe, Bauteil und Anzahl; die Machbarkeit wird technisch beurteilt.",
          "en": "No diameter range is guaranteed in advance. Share size, depth, material and quantity for a technical assessment.",
          "uk": "Гарантованого списку діаметрів немає. Вкажіть розмір, глибину, матеріал і кількість для технічної оцінки.",
          "ru": "Гарантированного перечня диаметров нет. Укажите размер, глубину, материал и количество для технической оценки."
        }
      },
      {
        "id": "bearing",
        "question": {
          "de": "Darf in tragende Bauteile gebohrt werden?",
          "en": "Can drilling be done in load-bearing structures?",
          "uk": "Чи можна бурити несучі конструкції?",
          "ru": "Можно ли бурить несущие конструкции?"
        },
        "answer": {
          "de": "Nicht ohne geeignete statische Prüfung und erforderliche Freigaben. Die Zuständigkeit des Tragwerksplaners und des qualifizierten Fachbetriebs ist vorab zu klären.",
          "en": "Not without appropriate structural assessment and required approvals. Responsibility of the engineer and qualified specialist must be established first.",
          "uk": "Не без відповідного розрахунку конструкцій і необхідних погоджень. Потрібно визначити відповідальність конструктора та кваліфікованого виконавця.",
          "ru": "Не без расчёта конструкций и необходимых согласований. Нужно определить ответственность конструктора и квалифицированного исполнителя."
        }
      },
      {
        "id": "lines",
        "question": {
          "de": "Was ist mit verdeckten Leitungen?",
          "en": "What about hidden pipes or cables?",
          "uk": "Що робити з прихованими комунікаціями?",
          "ru": "Что делать со скрытыми коммуникациями?"
        },
        "answer": {
          "de": "Bestandspläne und eine geeignete Ortung müssen vor Bohrarbeiten geprüft werden. Ohne sichere Klärung kann keine Ausführung zugesagt werden.",
          "en": "Existing plans and suitable detection must be assessed before drilling. Work cannot be confirmed without adequate checks.",
          "uk": "Перед бурінням перевіряють плани та можливість виявлення комунікацій. Без належної перевірки виконання не підтверджується.",
          "ru": "Перед бурением проверяют планы и возможность обнаружения коммуникаций. Без достаточной проверки работы не подтверждаются."
        }
      },
      {
        "id": "permissions",
        "question": {
          "de": "Wer kümmert sich um Genehmigungen?",
          "en": "Who arranges technical permits?",
          "uk": "Хто відповідає за технічні дозволи?",
          "ru": "Кто отвечает за технические разрешения?"
        },
        "answer": {
          "de": "Welche Nachweise oder Zustimmungen nötig sind und wer sie einholt, muss vor Vertragsabschluss schriftlich festgelegt werden.",
          "en": "Required permissions, documentation and the responsible party must be clarified in writing before contracting.",
          "uk": "Перелік потрібних дозволів, документів і відповідальних сторін необхідно письмово узгодити до договору.",
          "ru": "Необходимые разрешения, документы и ответственных лиц нужно письменно согласовать до договора."
        }
      },
      {
        "id": "dust",
        "question": {
          "de": "Wie werden Staub, Wasser und Lärm beim Bohren behandelt?",
          "en": "How are drilling dust, water and noise handled?",
          "uk": "Як контролюють пил, воду та шум під час буріння?",
          "ru": "Как контролируют пыль, воду и шум при бурении?"
        },
        "answer": {
          "de": "Das Schutzverfahren hängt von Material, Technik und Umfeld ab. Geeignete Absaugung, Wasserführung, Abschirmung und zulässige Arbeitszeiten sind Teil der Vorprüfung.",
          "en": "Controls depend on material, method and surroundings. Extraction, water control, screening and permitted working hours are checked in advance.",
          "uk": "Захист залежить від матеріалу, методу й об’єкта. Відведення води, пиловидалення, ізоляцію та допустимі години перевіряють заздалегідь.",
          "ru": "Защита зависит от материала, метода и объекта. Отвод воды, пылеудаление, изоляцию и допустимые часы проверяют заранее."
        }
      }
    ]
  },
  {
    "id": "pricing",
    "title": {
      "de": "Preise & Verträge",
      "en": "Pricing & contracts",
      "uk": "Вартість та договори",
      "ru": "Стоимость и договоры"
    },
    "items": [
      {
        "id": "estimate",
        "question": {
          "de": "Was kostet eine Baureinigung?",
          "en": "How much does construction cleaning cost?",
          "uk": "Скільки коштує будівельний клінінг?",
          "ru": "Сколько стоит строительный клининг?"
        },
        "answer": {
          "de": "Entscheidend sind Fläche, Verschmutzung, Bauphase, Zugang und Leistungsumfang. Eine belastbare Kalkulation erfolgt nach Klärung dieser Angaben.",
          "en": "Area, condition, construction stage, access and scope affect the price. A reliable quote follows a review of these details.",
          "uk": "Ціна залежить від площі, забруднення, етапу, доступу й обсягу. Розрахунок можливий після уточнення цих даних.",
          "ru": "Цена зависит от площади, загрязнения, этапа, доступа и объёма. Расчёт возможен после уточнения данных."
        }
      },
      {
        "id": "sqm",
        "question": {
          "de": "Gibt es feste Quadratmeterpreise?",
          "en": "Do you publish fixed prices per square metre?",
          "uk": "Чи є фіксована ціна за квадратний метр?",
          "ru": "Есть ли фиксированная цена за квадратный метр?"
        },
        "answer": {
          "de": "Ein pauschaler Quadratmeterpreis wäre ohne Objektzustand und Leistungsbeschreibung irreführend. Wir besprechen eine individuelle Kalkulation.",
          "en": "A flat price per square metre without details of the site and work would be misleading. Pricing is assessed individually.",
          "uk": "Фіксована ставка без оцінки стану об’єкта й переліку робіт була б неточною. Вартість розраховується індивідуально.",
          "ru": "Фиксированная ставка без оценки объекта и перечня работ была бы неточной. Цена рассчитывается индивидуально."
        }
      },
      {
        "id": "quote",
        "question": {
          "de": "Ist die Anfrage bereits ein Auftrag?",
          "en": "Does an enquiry create a binding order?",
          "uk": "Чи стає запит автоматично замовленням?",
          "ru": "Становится ли заявка автоматически заказом?"
        },
        "answer": {
          "de": "Nein. Eine Anfrage dient der Abstimmung. Umfang, Preis, Termin und Vertragsbedingungen müssen gesondert vereinbart werden.",
          "en": "No. An enquiry starts a discussion; scope, price, timing and contractual terms require separate agreement.",
          "uk": "Ні. Запит лише починає обговорення; обсяг, ціну, дату й умови договору погоджують окремо.",
          "ru": "Нет. Заявка лишь начинает обсуждение; объём, цену, дату и условия договора согласуют отдельно."
        }
      },
      {
        "id": "visit",
        "question": {
          "de": "Ist eine Besichtigung erforderlich?",
          "en": "Is a site visit required?",
          "uk": "Чи потрібен огляд об’єкта?",
          "ru": "Нужен ли осмотр объекта?"
        },
        "answer": {
          "de": "Das hängt von Fläche, Material, Zugänglichkeit und Risiko ab. Bei komplexen oder technischen Leistungen kann ein Ortstermin notwendig sein.",
          "en": "That depends on area, materials, access and risk. Complex or technical jobs may require an on-site assessment.",
          "uk": "Це залежить від площі, матеріалів, доступу й ризику. Складні або технічні роботи можуть вимагати огляду.",
          "ru": "Это зависит от площади, материалов, доступа и рисков. Сложные или технические работы могут требовать осмотра."
        }
      },
      {
        "id": "minimum",
        "question": {
          "de": "Gibt es einen Mindestauftragswert?",
          "en": "Is there a minimum order size?",
          "uk": "Чи є мінімальна сума замовлення?",
          "ru": "Есть ли минимальная сумма заказа?"
        },
        "answer": {
          "de": "Ob sich ein kleiner Einzelauftrag realisieren lässt, klären wir nach Ort, Anfahrt und gewünschtem Leistungsumfang.",
          "en": "We review the viability of small jobs based on location, travel and scope.",
          "uk": "Можливість невеликого замовлення визначають за адресою, виїздом та обсягом.",
          "ru": "Возможность небольшого заказа зависит от адреса, выезда и объёма."
        }
      },
      {
        "id": "invoice",
        "question": {
          "de": "Wie werden Firmenaufträge abgerechnet?",
          "en": "How are business contracts invoiced?",
          "uk": "Як виставляють рахунки компаніям?",
          "ru": "Как выставляют счета компаниям?"
        },
        "answer": {
          "de": "Rechnungsmodalitäten, Leistungsnachweise, Zahlungsziel und etwaige Zusatzkosten werden im jeweiligen Angebot oder Vertrag geregelt.",
          "en": "Invoicing, work records, payment terms and additional charges are agreed in the quotation or contract.",
          "uk": "Порядок рахунків, акти, терміни оплати й додаткові витрати визначаються пропозицією або договором.",
          "ru": "Порядок счетов, актов, сроки оплаты и дополнительные расходы определяются предложением или договором."
        }
      },
      {
        "id": "scopechange",
        "question": {
          "de": "Was passiert bei zusätzlichen Arbeiten?",
          "en": "What if the scope changes during the project?",
          "uk": "Що буде, якщо під час робіт з’являться додаткові завдання?",
          "ru": "Что если во время работ появятся дополнительные задачи?"
        },
        "answer": {
          "de": "Zusätzliche Leistungen sollten vor der Ausführung mit Umfang, Verantwortlichen, Zeit und Kosten freigegeben werden.",
          "en": "Additional tasks should be approved with scope, responsibility, time and cost before being performed.",
          "uk": "Додаткові роботи слід погодити за обсягом, відповідальними, строком і ціною до виконання.",
          "ru": "Дополнительные работы следует согласовать по объёму, ответственным, срокам и цене до выполнения."
        }
      }
    ]
  },
  {
    "id": "process",
    "title": {
      "de": "Ablauf, Termine & Sicherheit",
      "en": "Scheduling & safety",
      "uk": "Графік, організація та безпека",
      "ru": "График, организация и безопасность"
    },
    "items": [
      {
        "id": "leadtime",
        "question": {
          "de": "Wann sollte ich die Reinigung anfragen?",
          "en": "When should I enquire about cleaning?",
          "uk": "Коли краще звернутися щодо прибирання?",
          "ru": "Когда лучше обращаться по поводу уборки?"
        },
        "answer": {
          "de": "Möglichst früh vor dem betreffenden Bauabschnitt oder Abnahmetermin. So lassen sich Umfang, Personalbedarf und Zugang abstimmen.",
          "en": "As early as possible before the relevant construction stage or inspection date, allowing time to agree scope and access.",
          "uk": "Якомога раніше до відповідного етапу чи приймання, щоб узгодити обсяг, ресурси та доступ.",
          "ru": "Как можно раньше до соответствующего этапа или приёмки, чтобы согласовать объём, ресурсы и доступ."
        }
      },
      {
        "id": "duration",
        "question": {
          "de": "Wie lange dauert ein Einsatz?",
          "en": "How long does a visit take?",
          "uk": "Скільки триває прибирання?",
          "ru": "Сколько длится уборка?"
        },
        "answer": {
          "de": "Die Dauer richtet sich nach Fläche, Verschmutzung, Zugänglichkeit und Zahl der Arbeitsphasen. Eine Zeitschätzung folgt erst nach Prüfung.",
          "en": "Duration depends on area, condition, accessibility and number of stages. An estimate follows a project review.",
          "uk": "Тривалість залежить від площі, забруднення, доступу та кількості етапів. Її оцінюють після перевірки проєкту.",
          "ru": "Продолжительность зависит от площади, загрязнения, доступа и числа этапов. Её оценивают после проверки проекта."
        }
      },
      {
        "id": "urgent",
        "question": {
          "de": "Sind kurzfristige Einsätze möglich?",
          "en": "Are short-notice jobs possible?",
          "uk": "Чи можливий терміновий виїзд?",
          "ru": "Возможен ли срочный выезд?"
        },
        "answer": {
          "de": "Kurzfristige Anfragen können gestellt werden; die tatsächliche Verfügbarkeit ist nicht automatisch garantiert.",
          "en": "You can request a short-notice job, but availability is not guaranteed.",
          "uk": "Терміновий запит можливий, але наявність вільного часу не гарантується.",
          "ru": "Срочную заявку можно подать, но наличие свободного времени не гарантируется."
        }
      },
      {
        "id": "afterhours",
        "question": {
          "de": "Arbeiten Sie abends oder am Wochenende?",
          "en": "Can work be scheduled for evenings or weekends?",
          "uk": "Чи можливі роботи ввечері або у вихідні?",
          "ru": "Возможны ли работы вечером или в выходные?"
        },
        "answer": {
          "de": "Abweichende Zeiten werden nur nach Verfügbarkeit, Baustellenordnung und gesetzlichen Vorgaben vereinbart.",
          "en": "Alternative hours depend on availability, site rules and applicable regulations.",
          "uk": "Незвичний графік можливий лише за наявності ресурсів і з дотриманням правил об’єкта та законодавства.",
          "ru": "Нестандартный график возможен только при наличии ресурсов и соблюдении правил объекта и закона."
        }
      },
      {
        "id": "access",
        "question": {
          "de": "Welche Zugänge müssen vorbereitet sein?",
          "en": "What access arrangements are needed?",
          "uk": "Які умови доступу потрібно підготувати?",
          "ru": "Какие условия доступа нужно подготовить?"
        },
        "answer": {
          "de": "Bitte klären Sie Anfahrt, Schlüssel oder Zutrittsfreigaben, Strom und Wasser sowie sichere Arbeitswege entsprechend dem Auftrag.",
          "en": "Please clarify arrival, keys or permissions, utilities and safe routes as relevant to the job.",
          "uk": "Уточніть заїзд, ключі або перепустки, електрику, воду та безпечні проходи відповідно до робіт.",
          "ru": "Уточните заезд, ключи или пропуска, электричество, воду и безопасные проходы согласно задаче."
        }
      },
      {
        "id": "safety",
        "question": {
          "de": "Wie werden Arbeiten mit besonderen Risiken behandelt?",
          "en": "How are higher-risk tasks handled?",
          "uk": "Як організовують роботи з підвищеним ризиком?",
          "ru": "Как организуют работы повышенного риска?"
        },
        "answer": {
          "de": "Vor einer Zusage sind Gefährdungen, erforderliche Qualifikationen, Freigaben und Zuständigkeiten zu bewerten. Schadstoffe oder tragende Eingriffe dürfen nicht ungeprüft bearbeitet werden.",
          "en": "Risks, qualifications, permissions and responsibilities must be reviewed before confirmation. Hazardous substances and structural work require specialist assessment.",
          "uk": "До підтвердження оцінюють ризики, кваліфікацію, дозволи та відповідальність. Небезпечні речовини й несучі конструкції потребують фахової оцінки.",
          "ru": "До подтверждения оценивают риски, квалификацию, разрешения и ответственность. Опасные вещества и несущие конструкции требуют оценки специалистов."
        }
      },
      {
        "id": "issues",
        "question": {
          "de": "Was kann ich bei Fragen nach einem Einsatz tun?",
          "en": "What if I have questions after the work?",
          "uk": "Що робити, якщо після виконання є зауваження?",
          "ru": "Что делать, если после выполнения есть замечания?"
        },
        "answer": {
          "de": "Melden Sie sich mit Projektbezug und einer Beschreibung direkt bei KnaBa. Die vereinbarten Abnahmekriterien und der Vertrag sind maßgeblich.",
          "en": "Contact KnaBa with the project reference and details. The agreed acceptance criteria and contract apply.",
          "uk": "Зверніться до KnaBa із зазначенням об’єкта й описом питання. Важливі погоджені критерії приймання та договір.",
          "ru": "Обратитесь в KnaBa с указанием объекта и описанием вопроса. Важны согласованные критерии приёмки и договор."
        }
      }
    ]
  }
];
export interface FaqCopy {eyebrow:string;title:string;lead:string;search:string;placeholder:string;category:string;all:string;results:string;empty:string;more:string;contact:string;back:string;pageTitle:string;pageDescription:string;}
export const faqCopy: Record<ConstructionLocale, FaqCopy> = {
  "de": {
    "eyebrow": "WISSEN / KNABA",
    "title": "Häufige Fragen. Klare Antworten.",
    "lead": "Vom ersten Bauabschnitt bis zur Übergabe: Antworten zu Reinigung, Bauhilfe, Zusatzarbeiten und Auftragsablauf.",
    "search": "Fragen durchsuchen",
    "placeholder": "Nach Stichwort suchen …",
    "category": "Thema auswählen",
    "all": "Alle Themen",
    "results": "Treffer",
    "empty": "Keine passenden Fragen gefunden. Versuchen Sie einen anderen Begriff.",
    "more": "Alle 42 Fragen ansehen",
    "contact": "Frage nicht dabei? Projekt anfragen",
    "back": "Zur Startseite",
    "pageTitle": "Fragen & Antworten zur Baureinigung | KnaBa Berlin",
    "pageDescription": "42 Antworten zu Baureinigung, Bauhelfern, Kernbohrungsanfragen, Kosten, Sicherheit und Bauablauf in Berlin und Brandenburg."
  },
  "en": {
    "eyebrow": "HELP / KNABA",
    "title": "Questions about your project?",
    "lead": "Clear answers about construction cleaning, site support, additional work and project planning.",
    "search": "Search questions",
    "placeholder": "Search for a topic …",
    "category": "Choose a topic",
    "all": "All topics",
    "results": "results",
    "empty": "No questions match. Try a different search.",
    "more": "View all 42 questions",
    "contact": "Still unsure? Send an enquiry",
    "back": "Back to homepage",
    "pageTitle": "Construction cleaning FAQs | KnaBa Berlin",
    "pageDescription": "42 answers on construction cleaning, site helpers, core-drilling enquiries, quotes and safety in Berlin and Brandenburg."
  },
  "uk": {
    "eyebrow": "ДОПОМОГА / KNABA",
    "title": "Поширені запитання та відповіді",
    "lead": "Про будівельний клінінг, помічників, додаткові роботи, ціни й організацію проєктів.",
    "search": "Пошук запитань",
    "placeholder": "Введіть слово або тему …",
    "category": "Виберіть тему",
    "all": "Усі теми",
    "results": "знайдено",
    "empty": "Нічого не знайдено. Спробуйте інший запит.",
    "more": "Переглянути всі 42 запитання",
    "contact": "Не знайшли відповіді? Надіслати запит",
    "back": "На головну",
    "pageTitle": "Запитання про будівельний клінінг | KnaBa Берлін",
    "pageDescription": "42 відповіді про клінінг, будівельних помічників, буріння, вартість і безпеку в Берліні та Бранденбурзі."
  },
  "ru": {
    "eyebrow": "ПОМОЩЬ / KNABA",
    "title": "Частые вопросы и ответы",
    "lead": "О строительном клининге, помощниках, дополнительных работах, стоимости и организации проектов.",
    "search": "Поиск вопросов",
    "placeholder": "Введите слово или тему …",
    "category": "Выберите тему",
    "all": "Все темы",
    "results": "найдено",
    "empty": "Ничего не найдено. Попробуйте другой запрос.",
    "more": "Посмотреть все 42 вопроса",
    "contact": "Не нашли ответ? Отправить запрос",
    "back": "На главную",
    "pageTitle": "Вопросы о строительном клининге | KnaBa Берлин",
    "pageDescription": "42 ответа о клининге, стройпомощниках, бурении, стоимости и безопасности в Берлине и Бранденбурге."
  }
};
