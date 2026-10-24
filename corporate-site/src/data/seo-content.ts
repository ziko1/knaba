import type { Service } from './company';

/** Original German editorial content. Company service scope verified at knaba.de/leistungen, 24 October 2026. */
type ServiceContent = {
  title: string;
  metaDescription: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
  scopeItems: string[];
  preparation: string[];
  faq: { question: string; answer: string }[];
  relatedGuide: string;
};

export const serviceContent: Record<Service['slug'], ServiceContent> = {
  unterhaltsreinigung: {
    title: 'Unterhaltsreinigung in Berlin & Brandenburg',
    metaDescription: 'Unterhaltsreinigung für Büro- und Gewerbeflächen in Berlin und Brandenburg. Mit KnaBa Reinigungsumfang, Intervalle und Zugang passend zum Objekt planen.',
    intro: 'Sauberkeit funktioniert im Alltag dann gut, wenn die Reinigung zu den Menschen im Gebäude passt. KnaBa unterstützt Sie bei der regelmäßigen Pflege Ihrer Büro-, Gewerbe- und Gemeinschaftsflächen in Berlin und Brandenburg. Gemeinsam klären wir, was gereinigt werden soll, wie häufig es nötig ist und wann die Räume zugänglich sind.',
    sections: [
      { heading: 'Ein Reinigungsplan statt offener Erwartungen', paragraphs: ['Ein Empfang mit Publikumsverkehr wird anders beansprucht als ein selten genutzter Besprechungsraum. Deshalb betrachten wir Nutzungsbereiche einzeln. Bodenflächen, frei zugängliche Oberflächen, Sanitärräume und Gemeinschaftsbereiche können unterschiedliche Intervalle benötigen.', 'Ein klarer Leistungsumfang hilft beiden Seiten: Er beschreibt die vereinbarten Arbeiten, grenzt zusätzliche Leistungen ab und macht spätere Anpassungen verständlich. Teilen Sie uns mit, welche Bereiche besonders wichtig sind und ob es saisonale Veränderungen oder feste Betriebszeiten gibt.'] },
      { heading: 'Regelmäßige Pflege sinnvoll ergänzen', paragraphs: ['Die Unterhaltsreinigung kümmert sich um wiederkehrende Verschmutzungen. Eine intensive Grundreinigung oder die Reinigung von Glasflächen gehört nicht automatisch zu jedem Turnus. Diese Arbeiten besprechen wir gesondert, damit Umfang und Aufwand vorab klar sind.', 'Für Schulen, Kindertagesstätten oder andere sensibel genutzte Gebäude stimmen wir den möglichen Leistungsumfang objektbezogen ab. Besondere Hygieneanforderungen, vorhandene Pläne und Zugangsvorgaben gehören bereits in das erste Gespräch.'] },
    ],
    scopeItems: ['Bodenflächen nach Material und Nutzung', 'Frei zugängliche Oberflächen im vereinbarten Bereich', 'Sanitär- und Gemeinschaftsbereiche', 'Abgestimmte wiederkehrende Reinigungsintervalle'],
    preparation: ['Objektart, Adresse und ungefähre Fläche', 'Raumgruppen und gewünschter Turnus', 'Zugangszeiten sowie sensible oder ausgeschlossene Bereiche', 'Bestehendes Leistungsverzeichnis, falls vorhanden'],
    faq: [
      { question: 'Was gehört zur Unterhaltsreinigung?', answer: 'Zur Unterhaltsreinigung zählen wiederkehrende Reinigungsarbeiten im vereinbarten Objekt. Welche Böden, Oberflächen und Sanitärbereiche dazugehören, wird im individuellen Leistungsumfang festgehalten.' },
      { question: 'Wie oft sollte gereinigt werden?', answer: 'Das hängt von Nutzung, Personenaufkommen, Raumart und Verschmutzung ab. Teilen Sie uns Ihren Bedarf mit; die passenden Intervalle stimmen wir für Ihr Objekt ab.' },
      { question: 'Kann der Reinigungsumfang später geändert werden?', answer: 'Wenn sich die Nutzung Ihrer Räume ändert, können Sie eine Anpassung anfragen. Zusätzliche oder veränderte Leistungen werden gemeinsam besprochen und vereinbart.' },
    ],
    relatedGuide: 'reinigungsleistungen-vergleichen',
  },
  bueroreinigung: {
    title: 'Büroreinigung in Berlin & Brandenburg',
    metaDescription: 'Büroreinigung in Berlin und Brandenburg: Arbeitsplätze, Empfang, Teeküche und Sanitärbereiche. Fragen Sie bei KnaBa ein passendes Reinigungskonzept an.',
    intro: 'Ein gepflegtes Büro schafft einen angenehmen Rahmen für Mitarbeitende, Besucher und Kundschaft. KnaBa bietet Büroreinigung in Berlin und Brandenburg an und stimmt die Arbeiten auf Ihre Räume und Betriebsabläufe ab. Vom kleinen Büro bis zu mehreren Nutzungsbereichen beginnt die Planung mit Ihrem konkreten Bedarf.',
    sections: [
      { heading: 'Arbeitsbereiche mit ihren Unterschieden planen', paragraphs: ['Empfang, Besprechungszimmer, Arbeitsplätze und Verkehrsflächen werden unterschiedlich genutzt. Für ein sinnvolles Angebot erfassen wir die Flächen und besprechen Bodenbeläge, frei zugängliche Oberflächen sowie Sanitär- und Küchenbereiche. Auch die Anzahl der regelmäßig anwesenden Personen kann für die Planung hilfreich sein.', 'Persönliche Unterlagen, Bildschirme, technische Geräte und verschlossene Schränke sollten ausdrücklich besprochen werden. Eine allgemeine Büroreinigung bedeutet nicht, dass alle Gegenstände angefasst oder alle Geräte gereinigt werden. Klare Grenzen schützen Ihre Abläufe und vermeiden Missverständnisse.'] },
      { heading: 'Reinigung und Büroalltag aufeinander abstimmen', paragraphs: ['Nennen Sie uns Ihre Betriebszeiten und die möglichen Zugangsfenster. Ob und wie sich die Ausführung außerhalb besonders belebter Zeiten einrichten lässt, klären wir im Angebot. Dazu gehören auch Ansprechpartner, Alarmanlagen und die Organisation des Zugangs.', 'Eine Büroreinigung kann als regelmäßige Unterhaltsreinigung geplant werden. Glasflächen oder eine intensive Reinigung nach Umbau und Umzug sind gesonderte Aufgaben. Über den Reinigungsplaner können Sie zunächst die passende Leistung auswählen und anschließend Ihre Anfrage vorbereiten.'] },
    ],
    scopeItems: ['Arbeits- und Besprechungsbereiche nach Vereinbarung', 'Empfang und Verkehrsflächen', 'Teeküchen und gemeinschaftlich genutzte Bereiche', 'Sanitärbereiche mit abgestimmtem Umfang'],
    preparation: ['Ungefähre Bürofläche und Zahl der Räume', 'Bodenbeläge, Sanitärbereiche und Teeküchen', 'Gewünschte Häufigkeit und mögliche Zeitfenster', 'Besondere Regeln zu Unterlagen, Technik und Zugang'],
    faq: [
      { question: 'Ist Büroreinigung außerhalb der Arbeitszeit möglich?', answer: 'Nennen Sie die gewünschten Zeitfenster in Ihrer Anfrage. Die konkrete Durchführung und Verfügbarkeit werden vor Beginn mit Ihnen abgestimmt.' },
      { question: 'Was beeinflusst die Kosten der Büroreinigung?', answer: 'Wichtig sind Fläche, Raumaufteilung, Bodenbeläge, Nutzung, Reinigungsintervall und Zugänglichkeit. Deshalb erstellt KnaBa ein Angebot für den vereinbarten Umfang Ihres Objekts.' },
      { question: 'Werden auch Fenster und Bildschirme gereinigt?', answer: 'Glasreinigung und die Behandlung technischer Geräte werden ausdrücklich vereinbart. Sie sind nicht automatisch Bestandteil jeder Büroreinigung.' },
    ],
    relatedGuide: 'bueroreinigung-checkliste',
  },
  glasreinigung: {
    title: 'Glas- und Fensterreinigung in Berlin',
    metaDescription: 'Glas-, Fenster- und Fassadenreinigung in Berlin und Brandenburg mit KnaBa. Umfang, Rahmen, Material und Erreichbarkeit vorab persönlich abstimmen.',
    intro: 'Klare Glasflächen tragen zum gepflegten Eindruck eines Gebäudes bei. KnaBa reinigt Fenster und Glasflächen in Berlin und Brandenburg. Bei Fassaden und schwer erreichbaren Bereichen klären wir zunächst Material, Zugang und den geeigneten Leistungsumfang.',
    sections: [
      { heading: 'Glasfläche, Rahmen und Zugang gemeinsam betrachten', paragraphs: ['Ein Fenster besteht aus mehr als der Scheibe. Rahmen, Falze, Fensterbänke und angrenzende Flächen können einen eigenen Aufwand verursachen. Damit Ihr Angebot vergleichbar ist, sollte eindeutig feststehen, welche Bestandteile und welche Seiten gereinigt werden.', 'Hilfreich sind Angaben zur Zahl und Größe der Fenster, zum Geschoss, zur Öffnungsart sowie zu möglichen Zugängen von innen und außen. Teilen Sie besondere Beschichtungen oder bekannte Vorschäden mit. Die passende Arbeitsweise hängt von diesen Bedingungen ab.'] },
      { heading: 'Gepflegter Auftritt für Gewerbe und Immobilien', paragraphs: ['Schaufenster, Eingangstüren aus Glas, Bürofenster und gemeinschaftliche Glasflächen haben unterschiedliche Anforderungen. Wir besprechen mit Ihnen den Anlass und den gewünschten Turnus. Eine regelmäßige Reinigung lässt sich ebenso anfragen wie eine einzelne Leistung.', 'Fassadenflächen benötigen eine gesonderte Einschätzung. Material, Zustand und Erreichbarkeit bestimmen, welche Reinigung infrage kommt. Baurückstände auf Glas sind ebenfalls eine besondere Aufgabe und sollten nicht als gewöhnliche Fensterreinigung eingeplant werden.'] },
    ],
    scopeItems: ['Fenster und andere vereinbarte Glasflächen', 'Innen- und Außenseiten nach Abstimmung', 'Rahmen und weitere Bestandteile nach Leistungsumfang', 'Fassadenflächen nach Prüfung von Material und Zugang'],
    preparation: ['Zahl, ungefähre Größe und Art der Glasflächen', 'Etagen, Öffnungsmöglichkeiten und Erreichbarkeit', 'Gewünschte Innen- und Außenseiten sowie Rahmen', 'Hinweise auf Beschichtungen, Schäden oder Baurückstände'],
    faq: [
      { question: 'Sind Fensterrahmen im Angebot enthalten?', answer: 'Das wird ausdrücklich vereinbart. Geben Sie bitte an, ob neben den Scheiben auch Rahmen, Falze oder Fensterbänke gereinigt werden sollen.' },
      { question: 'Reinigt KnaBa auch Fassaden?', answer: 'Glas- und Fassadenreinigung gehören zum Leistungsangebot. Ob die konkrete Fläche gereinigt werden kann und welches Verfahren geeignet ist, klären wir nach Material, Zustand und Zugänglichkeit.' },
      { question: 'Wie häufig ist eine Glasreinigung sinnvoll?', answer: 'Der passende Rhythmus hängt unter anderem von Lage, Nutzung und sichtbarer Verschmutzung ab. Ein Schaufenster kann andere Anforderungen haben als ein wenig beanspruchtes Bürofenster.' },
    ],
    relatedGuide: 'reinigungsleistungen-vergleichen',
  },
  baureinigung: {
    title: 'Baureinigung und Bauendreinigung in Berlin',
    metaDescription: 'Baugrob-, Baufein- und Bauendreinigung in Berlin und Brandenburg. Mit KnaBa Bauphase, Reinigungsumfang und Übergabetermin abgestimmt planen.',
    intro: 'Nach Bau- oder Renovierungsarbeiten soll aus einer Baustelle ein nutzbarer Raum werden. KnaBa bietet Baugrob-, Baufein- und Bauendreinigung in Berlin und Brandenburg an. Wir besprechen, in welcher Bauphase sich Ihr Objekt befindet und welche Flächen bis zu welchem Termin gereinigt werden sollen.',
    sections: [
      { heading: 'Die Reinigung zur Bauphase passend beauftragen', paragraphs: ['Während der Bauphase geht es um andere Aufgaben als unmittelbar vor der Übergabe. Eine Grobreinigung begleitet einen noch laufenden Bauablauf; die Fein- und Endreinigung bereitet die vereinbarten Flächen auf die spätere Nutzung vor. Die Begriffe allein reichen für ein Angebot nicht aus: Entscheidend ist die konkrete Aufgabenliste.', 'Benennen Sie die fertigen Bereiche, noch aktive Gewerke und gegebenenfalls mehrere Übergabeabschnitte. Wenn nach der Reinigung erneut staubende Arbeiten stattfinden, kann eine weitere Reinigung nötig werden. Eine gemeinsame Terminabstimmung reduziert solche vermeidbaren Überschneidungen.'] },
      { heading: 'Neue Oberflächen brauchen eine genaue Abstimmung', paragraphs: ['Bodenbeläge, Glas, Beschichtungen und Einbauten können empfindlich sein. Angaben zu Materialien und vorhandene Pflegehinweise helfen bei der Planung. Teilen Sie auch mit, ob Klebereste, Farbrückstände oder besondere Verschmutzungen vorhanden sind. Ihre Entfernung wird gesondert auf Machbarkeit und Umfang geprüft.', 'Nicht jede Entsorgung oder Behandlung besonderer Stoffe ist automatisch Bestandteil einer Baureinigung. Klären Sie diese Aufgaben vorab und geben Sie keine Gefahrstoffe oder unbekannten Rückstände als normale Reinigungsarbeit frei. Für das Angebot sind außerdem Wasser, Strom, Zufahrt und die Organisation des Zutritts relevant.'] },
    ],
    scopeItems: ['Baugrobreinigung im vereinbarten Bauabschnitt', 'Baufeinreinigung der fertiggestellten Bereiche', 'Bauendreinigung vor der geplanten Übergabe', 'Objektbezogene Abstimmung von Materialien und Rückständen'],
    preparation: ['Bauphase, Objektart und zu reinigende Teilflächen', 'Gewünschter Termin und geplante Übergabeabschnitte', 'Materialien, Schutzfolien und besondere Rückstände', 'Zugang, Zufahrt sowie Wasser- und Stromversorgung'],
    faq: [
      { question: 'Was unterscheidet Baufein- und Bauendreinigung?', answer: 'Die Bezeichnungen werden je nach Bauprojekt unterschiedlich genutzt. Entscheidend ist, welche fertiggestellten Flächen und Rückstände gereinigt werden sollen und ob danach noch weitere Bauarbeiten stattfinden. KnaBa stimmt den Umfang konkret mit Ihnen ab.' },
      { question: 'Wann sollte die Bauendreinigung stattfinden?', answer: 'Planen Sie sie nach den relevanten staub- und schmutzverursachenden Arbeiten und vor der gewünschten Nutzung beziehungsweise Übergabe. Noch ausstehende Arbeiten und Teilabnahmen sollten bei der Terminplanung bekannt sein.' },
      { question: 'Sind Bauschuttentsorgung und Spezialrückstände enthalten?', answer: 'Entsorgung, besondere Rückstände und andere Zusatzarbeiten sind ausdrücklich abzustimmen. Sie sind nicht automatisch Bestandteil jeder Baureinigung.' },
    ],
    relatedGuide: 'bauendreinigung-vorbereiten',
  },
  grundreinigung: {
    title: 'Grund- und Sonderreinigung in Berlin',
    metaDescription: 'Grund- und Sonderreinigung für beanspruchte Flächen in Berlin und Brandenburg. KnaBa klärt Material, Verschmutzung und geeigneten Leistungsumfang.',
    intro: 'Manchmal reicht die laufende Reinigung nicht mehr aus. Bei stärker beanspruchten Flächen, angesammelten Verschmutzungen oder besonderen Anlässen kann eine Grundreinigung sinnvoll sein. KnaBa bespricht mit Ihnen die Aufgabe, den Zustand Ihrer Oberflächen und die Möglichkeiten einer objektbezogenen Sonderreinigung.',
    sections: [
      { heading: 'Vom Material aus denken', paragraphs: ['Ein Natursteinboden, ein elastischer Belag und eine beschichtete Oberfläche brauchen unterschiedliche Aufmerksamkeit. Für eine erste Einschätzung sind Materialangaben, vorhandene Pflegeinformationen und eine Beschreibung der Verschmutzung besonders hilfreich. Wenn das Material unbekannt ist, sagen Sie das bitte ausdrücklich.', 'Intensive Reinigung kann den Zustand einer Fläche verbessern; sie ersetzt jedoch keine Reparatur und beseitigt nicht jede Verfärbung oder Beschädigung. Deshalb sollten erreichbares Ergebnis, mögliche Einschränkungen und der vereinbarte Umfang vor dem Einsatz besprochen werden.'] },
      { heading: 'Einmalige Aufgaben mit dem Alltag verbinden', paragraphs: ['Eine Grundreinigung kann beispielsweise bei einer Nutzungsänderung, vor einem neuen Reinigungsturnus oder für stark beanspruchte Bereiche angefragt werden. Damit die Durchführung planbar ist, klären wir Zugang, Möblierung und die Zeit, in der Flächen nicht genutzt werden können.', 'Sonderreinigung ist ein Sammelbegriff für sehr unterschiedliche Aufgaben. Beschreiben Sie Ihre Situation möglichst konkret. Gefahrstoffe, unbekannte Rückstände oder sensible technische Anlagen erfordern eine eigene Prüfung; aus der allgemeinen Leistungsbezeichnung lässt sich keine Eignung für jede Spezialaufgabe ableiten.'] },
    ],
    scopeItems: ['Intensive Reinigung vereinbarter Flächen', 'Abstimmung auf Material und Oberflächenzustand', 'Besondere Reinigungsaufgaben nach Prüfung', 'Planung von Zugänglichkeit und Nutzungsunterbrechung'],
    preparation: ['Material oder vorhandene Pflegeanleitung', 'Beschreibung von Verschmutzungen und Vorschäden', 'Fläche, Möblierung und zugängliche Teilbereiche', 'Gewünschtes Ergebnis und mögliche Sperrzeiten'],
    faq: [
      { question: 'Was ist der Unterschied zur Unterhaltsreinigung?', answer: 'Die Unterhaltsreinigung umfasst wiederkehrende Pflege. Eine Grundreinigung ist eine intensivere, gesondert vereinbarte Arbeit für bestimmte Flächen oder Verschmutzungen.' },
      { question: 'Lässt sich jede Verfärbung entfernen?', answer: 'Nein. Das Ergebnis hängt von Material, Ursache, Dauer und Art der Verschmutzung ab. Beschädigungen und Materialveränderungen können nicht einfach wegzureinigen sein; die Möglichkeiten müssen vorab geprüft werden.' },
      { question: 'Kann die Fläche während der Reinigung genutzt werden?', answer: 'Das richtet sich nach der Aufgabe und dem geeigneten Verfahren. Zugänge, Arbeitsbereiche und mögliche Warte- oder Trocknungszeiten werden vorab abgestimmt.' },
    ],
    relatedGuide: 'reinigungsleistungen-vergleichen',
  },
  treppenreinigung: {
    title: 'Treppenhausreinigung in Berlin',
    metaDescription: 'Treppenhausreinigung für Hausverwaltungen und Eigentümer in Berlin und Brandenburg. Eingänge, Treppen, Podeste und Geländer mit KnaBa planen.',
    intro: 'Das Treppenhaus ist eine täglich genutzte Visitenkarte Ihrer Immobilie. KnaBa unterstützt Hausverwaltungen und Eigentümer bei der Reinigung von Eingängen, Treppen, Podesten und gemeinschaftlichen Bereichen in Berlin und Brandenburg. Der genaue Umfang richtet sich nach Gebäude, Nutzung und Ihrem gewünschten Turnus.',
    sections: [
      { heading: 'Jeder Aufgang braucht eine klare Leistungsbeschreibung', paragraphs: ['Für ein Angebot sind nicht nur die Etagen wichtig. Auch die Zahl der Aufgänge, die Größe der Podeste, der Bodenbelag und die Nutzung des Eingangs beeinflussen den Aufwand. Geländer, Handläufe, Briefkastenanlagen oder zusätzliche Flure sollten einzeln benannt werden, sofern sie einbezogen werden sollen.', 'Kellerzugänge, Aufzüge und Glasflächen sind nicht automatisch Teil jeder Treppenhausreinigung. Eine nachvollziehbare Aufteilung in regelmäßige und gesonderte Arbeiten erleichtert der Verwaltung die Abstimmung und gibt Bewohnern klare Orientierung.'] },
      { heading: 'Ein Turnus, der zur Immobilie passt', paragraphs: ['Ein stark frequentiertes Wohn- oder Gewerbehaus benötigt eine andere Planung als ein kleiner, wenig genutzter Aufgang. Schmutzeintrag durch Witterung oder Bauarbeiten kann zusätzlich berücksichtigt werden. Den gewünschten Rhythmus und mögliche Anpassungen besprechen wir im persönlichen Kontakt.', 'Wichtig sind außerdem Zugang, Ansprechpartner und die vereinbarten Zeitfenster. Private Gegenstände auf Treppen oder Podesten sollten nicht ohne Absprache bewegt werden. Teilen Sie Besonderheiten des Hauses frühzeitig mit, damit die Reinigung gut vorbereitet werden kann.'] },
    ],
    scopeItems: ['Treppenstufen, Podeste und Eingangsbereiche', 'Geländer, Handläufe und vereinbarte Kontaktflächen', 'Weitere Gemeinschaftsflächen nach Abstimmung', 'Regelmäßige Pflege im vereinbarten Turnus'],
    preparation: ['Anzahl der Aufgänge und Etagen', 'Bodenmaterial sowie zusätzliche Gemeinschaftsbereiche', 'Gewünschter Turnus und besondere Verschmutzungen', 'Zugang und Ansprechpartner der Verwaltung'],
    faq: [
      { question: 'Welche Angaben braucht KnaBa für ein Angebot?', answer: 'Hilfreich sind Adresse, Anzahl der Aufgänge und Etagen, Bodenmaterial, gewünschte Intervalle und zusätzliche Flächen. Ein bestehendes Leistungsverzeichnis kann die Abstimmung erleichtern.' },
      { question: 'Sind Fenster, Keller und Aufzug enthalten?', answer: 'Diese Bereiche werden gesondert im Leistungsumfang benannt. Teilen Sie uns mit, welche Gemeinschaftsflächen zusätzlich zu Treppen und Eingängen gereinigt werden sollen.' },
      { question: 'Kann eine Hausverwaltung mehrere Objekte anfragen?', answer: 'Ja, Sie können den Bedarf für mehrere Objekte mit KnaBa besprechen. Für eine verlässliche Planung werden die Anforderungen und die Verfügbarkeit je Objekt abgestimmt.' },
    ],
    relatedGuide: 'treppenhausreinigung-leistungsverzeichnis',
  },
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  intro: string;
  sections: { id: string; title: string; paragraphs: string[]; bullets?: string[] }[];
  checklist: string[];
  serviceSlug: Service['slug'];
  readMinutes: number;
};

export const guides: Guide[] = [
  {
    slug: 'bueroreinigung-checkliste',
    title: 'Büroreinigung planen: die Checkliste für Ihre Anfrage',
    description: 'Welche Angaben braucht eine Reinigungsfirma? So bereiten Sie Fläche, Raumgruppen, Turnus und Zugang für ein passendes Angebot zur Büroreinigung vor.',
    eyebrow: 'FÜR UNTERNEHMEN & VERWALTUNGEN',
    intro: 'Ein gutes Angebot beginnt mit einer verständlichen Beschreibung Ihres Büros. Sie müssen dafür weder jeden Quadratmeter ausmessen noch bereits einen fertigen Reinigungsplan haben. Diese Checkliste hilft, den Bedarf zu ordnen und die richtigen Fragen zu stellen.',
    sections: [
      { id: 'raeume', title: '1. Räume nach Nutzung aufteilen', paragraphs: ['Notieren Sie zunächst die ungefähre Gesamtfläche und die Bereiche, die gereinigt werden sollen. Trennen Sie Arbeitsplätze, Besprechungsräume, Empfang, Flure, Teeküche und Sanitärbereiche. Eine Skizze oder vorhandene Raumliste kann helfen; für die erste Anfrage reicht häufig eine nachvollziehbare Beschreibung.', 'Die Fläche allein beschreibt den Aufwand nicht vollständig. Viele kleine Räume, unterschiedliche Bodenbeläge oder intensiv genutzte Sanitärbereiche machen einen Unterschied. Nennen Sie deshalb die Besonderheiten, die man aus der Quadratmeterzahl nicht erkennen kann.'], bullets: ['Welche Räume gehören dazu – und welche ausdrücklich nicht?', 'Welche Bodenbeläge und frei zugänglichen Oberflächen gibt es?', 'Wie viele Personen nutzen die Räume ungefähr?'] },
      { id: 'turnus', title: '2. Gewünschtes Ergebnis und Turnus beschreiben', paragraphs: ['Überlegen Sie, welche Bereiche täglich genutzt werden und wo sich Verschmutzungen besonders schnell zeigen. Geben Sie Ihren gewünschten Rhythmus an, ohne daraus bereits eine starre Vorgabe für jeden Raum machen zu müssen. Der passende Umfang lässt sich anschließend gemeinsam abstimmen.', 'Unterscheiden Sie regelmäßige Pflege von zusätzlichen Aufgaben. Fensterreinigung, intensive Bodenreinigung oder eine Reinigung nach einem Umbau sollten erkennbar separat angefragt werden. So lassen sich Angebote besser vergleichen und Leistungen später eindeutig zuordnen.'] },
      { id: 'zugang', title: '3. Zugang und sensible Bereiche klären', paragraphs: ['Eine Reinigung muss in Ihre Betriebsabläufe passen. Halten Sie fest, wann der Zugang möglich ist, wer die Abstimmung übernimmt und welche Bereiche nur begleitet betreten werden dürfen. Alarmanlagen oder besondere Hausregeln gehören in die persönliche Abstimmung.', 'Senden Sie in einer ersten Anfrage keine Schlüsselcodes, Passwörter oder vertraulichen Unterlagen. Es genügt der Hinweis, dass ein geregelter Zugang erforderlich ist. Räumen Sie persönliche Dokumente und bewegliche Arbeitsmaterialien entsprechend der späteren Vereinbarung weg.'] },
      { id: 'vergleich', title: '4. Das Angebot anhand des Umfangs prüfen', paragraphs: ['Prüfen Sie nicht nur den Gesamtpreis. Stimmen Räume, Arbeiten und Häufigkeiten mit Ihrer Anfrage überein? Ist erkennbar, welche Leistungen zusätzlich berechnet werden oder nicht enthalten sind? Wer ist bei Fragen erreichbar und wie werden Änderungen abgestimmt?', 'Eine kurze Rückfrage vor dem Start ist hilfreicher als eine unterschiedliche Erwartung nach dem ersten Einsatz. Bei KnaBa können Sie Ihre Angaben im Reinigungsplaner strukturieren und anschließend den konkreten Bedarf besprechen.'], bullets: ['Enthaltene Flächen und Leistungen nachvollziehen', 'Intervalle und Ausführungsfenster abgleichen', 'Zusatzarbeiten, Start und Zugang gemeinsam vereinbaren'] },
    ],
    checklist: ['Adresse und ungefähre Fläche', 'Raumgruppen und Bodenbeläge', 'Gewünschte Häufigkeit', 'Zugangsfenster und Ansprechpartner', 'Zusatzleistungen und ausgeschlossene Bereiche'],
    serviceSlug: 'bueroreinigung', readMinutes: 4,
  },
  {
    slug: 'bauendreinigung-vorbereiten',
    title: 'Bauendreinigung vorbereiten: von der Bauphase zur Übergabe',
    description: 'Bauendreinigung sinnvoll planen: fertige Bereiche, Materialien, Rückstände, Zugang und Übergabetermin vorab klären. Eine praktische Checkliste.',
    eyebrow: 'FÜR BAUHERREN & BAULEITUNGEN',
    intro: 'Eine Bauendreinigung lässt sich am besten planen, wenn der Zustand des Objekts und die noch anstehenden Arbeiten bekannt sind. Eine gute Vorbereitung hilft, doppelte Reinigung zu vermeiden und die Erwartungen an die Übergabe klar zu formulieren.',
    sections: [
      { id: 'bauzustand', title: '1. Den tatsächlichen Bauzustand beschreiben', paragraphs: ['Ist das Gebäude fertiggestellt, laufen noch einzelne Gewerke oder werden nur Teilbereiche übergeben? Diese Informationen sind wichtiger als die allgemeine Bezeichnung „Endreinigung“. Teilen Sie mit, wo noch gearbeitet wird und welche Räume bereits für die Reinigung freigegeben werden können.', 'Eine Reinigung vor weiteren Bohr-, Schleif- oder Malerarbeiten kann erneuten Aufwand verursachen. Stimmen Sie deshalb die Reihenfolge mit der Bauleitung ab. Bei mehreren Übergabeabschnitten sollten Flächen und Termine getrennt erfasst werden.'] },
      { id: 'oberflaechen', title: '2. Materialien und Rückstände erfassen', paragraphs: ['Listen Sie die wichtigsten Oberflächen auf: etwa Bodenbeläge, Glas, Sanitärkeramik, Türen und Einbauten. Neue Materialien können besondere Pflegevorgaben haben. Übergeben Sie vorhandene Herstellerhinweise bei der Detailabstimmung.', 'Beschreiben Sie sichtbare Rückstände wie Staub, Schutzfolien, Etiketten, Farb- oder Klebereste, ohne ihre Entfernung pauschal vorauszusetzen. Bekannte Vorschäden und empfindliche Beschichtungen sollten vorab dokumentiert werden. Unbekannte oder gefährliche Stoffe müssen gesondert beurteilt werden; sie gehören nicht in eine gewöhnliche Reinigungsanfrage.'] },
      { id: 'organisation', title: '3. Die Bedingungen am Objekt organisieren', paragraphs: ['Klären Sie, wer den Zugang ermöglicht und wer Entscheidungen am Objekt treffen kann. Auch Zufahrt, mögliche Anlieferung, Wasser und Strom können für die Durchführung wichtig sein. Melden Sie Einschränkungen frühzeitig, statt sie erst beim geplanten Einsatz zu entdecken.', 'Freie Arbeitsbereiche erleichtern die Reinigung. Vereinbaren Sie, welche Gegenstände vorher entfernt werden müssen und was vor Ort verbleibt. Die Entsorgung von Bauabfällen ist ausdrücklich zu klären; sie ergibt sich nicht automatisch aus dem Auftrag zur Bauendreinigung.'] },
      { id: 'uebergabe', title: '4. Umfang und Übergabe gemeinsam festhalten', paragraphs: ['Beschreiben Sie das gewünschte Ergebnis über konkrete Flächen und Arbeiten. Begriffe wie „bezugsfertig“ oder „besenrein“ können unterschiedlich verstanden werden und ersetzen keine Leistungsbeschreibung. Eine gemeinsame Abstimmung schafft Klarheit darüber, was der Auftrag umfasst.', 'Legen Sie fest, wer das gereinigte Objekt entgegennimmt und wie offene Punkte erfasst werden. Halten Sie bei Bedarf einzelne Bauabschnitte getrennt fest. Die Reinigung ersetzt dabei weder die bauliche Abnahme noch die Prüfung anderer Gewerke.'] },
    ],
    checklist: ['Bauphase und noch laufende Arbeiten', 'Fertiggestellte Flächen und Materialien', 'Rückstände, Vorschäden und Pflegehinweise', 'Wasser, Strom, Zufahrt und Zugang', 'Gewünschte Übergabe und verantwortliche Kontaktperson'],
    serviceSlug: 'baureinigung', readMinutes: 4,
  },
  {
    slug: 'treppenhausreinigung-leistungsverzeichnis',
    title: 'Treppenhausreinigung: ein klares Leistungsverzeichnis erstellen',
    description: 'Treppenhausreinigung für Hausverwaltungen planen: Aufgänge, Etagen, Gemeinschaftsflächen, Intervalle und Zusatzarbeiten verständlich beschreiben.',
    eyebrow: 'FÜR HAUSVERWALTUNGEN & EIGENTÜMER',
    intro: 'Ein Leistungsverzeichnis beantwortet eine einfache Frage: Was soll in welchem Bereich wie häufig gereinigt werden? Für ein Treppenhaus ist eine kurze, eindeutige Aufstellung oft hilfreicher als eine lange Liste unklarer Sammelbegriffe.',
    sections: [
      { id: 'objekt', title: '1. Den Gebäudeumfang eindeutig abgrenzen', paragraphs: ['Beginnen Sie mit Adresse, Zahl der Aufgänge und Etagen. Beschreiben Sie Eingänge, Podeste und Treppenläufe sowie vorhandene Bodenbeläge. Ein Erdgeschoss mit großer Halle kann mehr Aufwand verursachen als mehrere kleine Podeste; die Etagenzahl allein reicht deshalb nicht immer aus.', 'Erfassen Sie weitere Gemeinschaftsflächen separat. Kellerflure, Aufzug, Briefkastenanlagen, Glasflächen oder Nebeneingänge sollten ausdrücklich aufgeführt werden, wenn sie zum Auftrag gehören sollen. Das verhindert, dass Verwaltung und Reinigungsunternehmen unterschiedliche Flächen voraussetzen.'] },
      { id: 'arbeiten', title: '2. Flächen und Arbeiten miteinander verbinden', paragraphs: ['Vermeiden Sie pauschale Einträge wie „alles reinigen“. Schreiben Sie stattdessen auf, welche Flächen gepflegt werden sollen: Treppenstufen und Podeste, Handläufe, Geländer oder frei zugängliche Flächen im Eingangsbereich. Material und Zugänglichkeit bestimmen mit, welche Behandlung sinnvoll ist.', 'Private Gegenstände, abgestellte Fahrräder und Dekorationen sollten nicht stillschweigend Teil der Reinigung werden. Vereinbaren Sie, wie mit nicht zugänglichen Flächen umgegangen wird und welche Vorbereitung durch Bewohner oder Verwaltung erforderlich ist.'] },
      { id: 'intervalle', title: '3. Wiederkehrende und zusätzliche Aufgaben trennen', paragraphs: ['Ordnen Sie den Bereichen den gewünschten Turnus zu. Wetter, Nutzerzahl und angrenzende Bauarbeiten können den Schmutzeintrag verändern. Halten Sie fest, wie zusätzliche Arbeiten angefragt und abgestimmt werden, statt sie als unbestimmte Dauerpflicht aufzunehmen.', 'Fensterreinigung, intensive Bodenreinigung oder die Reinigung nach Baumaßnahmen sind gesonderte Aufgaben. Wenn diese Leistungen gewünscht sind, sollten sie mit eigenem Umfang und Zeitpunkt erkennbar bleiben.'], bullets: ['Regelmäßige Treppen- und Eingangsreinigung', 'Zusätzliche Gemeinschaftsflächen nach Vereinbarung', 'Separate Glas- oder Grundreinigung', 'Besondere Anlässe und kurzfristiger Zusatzbedarf'] },
      { id: 'abstimmung', title: '4. Den Ablauf für alle Beteiligten verständlich machen', paragraphs: ['Benennen Sie eine erreichbare Kontaktperson und klären Sie Zugang sowie mögliche Ausführungsfenster. Überlegen Sie, welche Informationen Bewohner benötigen, damit die Arbeiten ohne unnötige Unterbrechungen möglich sind.', 'Bei mehreren Immobilien lohnt sich eine einheitliche Struktur mit objektspezifischen Angaben. So bleibt der Umfang vergleichbar, ohne die Unterschiede der Häuser zu übersehen. KnaBa bespricht mit Ihnen, welche Arbeiten für die jeweilige Immobilie vereinbart werden können.'] },
    ],
    checklist: ['Aufgänge, Etagen und Bodenbeläge', 'Enthaltene Gemeinschaftsflächen', 'Arbeiten und gewünschte Intervalle', 'Gesonderte Glas- oder Grundreinigung', 'Kontakt, Zugang und Umgang mit Hindernissen'],
    serviceSlug: 'treppenreinigung', readMinutes: 4,
  },
  {
    slug: 'reinigungsleistungen-vergleichen',
    title: 'Reinigungsangebote vergleichen: worauf es neben dem Preis ankommt',
    description: 'Gebäudereinigung vergleichen: Leistungsumfang, Intervalle, Zusatzarbeiten und Objektbedingungen prüfen. So wird Ihre Entscheidung nachvollziehbarer.',
    eyebrow: 'ENTSCHEIDUNGSHILFE FÜR AUFTRAGGEBER',
    intro: 'Zwei Reinigungsangebote können ähnlich aussehen und trotzdem unterschiedliche Leistungen enthalten. Ein sinnvoller Vergleich beginnt mit denselben Ausgangsangaben und einer klaren Vorstellung davon, was Ihr Objekt braucht.',
    sections: [
      { id: 'ausgangslage', title: '1. Dieselbe Ausgangslage zugrunde legen', paragraphs: ['Senden Sie den angefragten Unternehmen möglichst dieselbe Beschreibung: Objektart, Fläche, Nutzung, Materialien und gewünschte Intervalle. Unterscheiden sich die Angaben, lassen sich die Angebote später nur schwer vergleichen.', 'Kennzeichnen Sie Schätzungen und unbekannte Details. Eine grobe Flächenangabe ist für die erste Kontaktaufnahme hilfreich, sollte aber nicht stillschweigend als exakt gelten. Wenn eine Besichtigung oder weitere Informationen nötig sind, kann der Leistungsumfang anschließend genauer festgelegt werden.'] },
      { id: 'umfang', title: '2. Enthaltene Leistungen tatsächlich abgleichen', paragraphs: ['Prüfen Sie, welche Räume und Arbeiten erfasst sind. Sind Sanitärbereiche, Teeküche und Eingang einbezogen? Werden bei Fenstern nur Scheiben oder auch Rahmen genannt? Ist eine Grundreinigung einmalig vorgesehen oder geht es ausschließlich um die laufende Pflege?', 'Achten Sie auf Ausschlüsse und Voraussetzungen. Technische Geräte, vertrauliche Unterlagen, schwer zugängliche Flächen und besondere Rückstände brauchen eine ausdrückliche Abstimmung. Ein niedrigerer Preis kann auf einen kleineren Leistungsumfang zurückgehen.'], bullets: ['Gleiche Flächen und Raumgruppen', 'Gleiche Arbeiten und Häufigkeiten', 'Klare Zuordnung von Zusatzleistungen', 'Nachvollziehbare Voraussetzungen und Ausschlüsse'] },
      { id: 'kosten', title: '3. Kostenfaktoren verstehen', paragraphs: ['Die Reinigungsfläche ist nur ein Teil der Kalkulation. Raumaufteilung, Zustand, Material, Nutzungsintensität, Erreichbarkeit und der gewünschte Turnus beeinflussen den Aufwand. Deshalb ist ein pauschaler Quadratmeterpreis ohne diese Angaben nur eingeschränkt aussagekräftig.', 'Vergleichen Sie auch den Abrechnungszeitraum und die Preisangaben im Angebot. Einmalige Arbeiten und laufende Leistungen sollten erkennbar getrennt sein. Fragen Sie nach, wenn Zusatzkosten, Material oder Anfahrtsbedingungen nicht verständlich beschrieben sind.'] },
      { id: 'zusammenarbeit', title: '4. Die Zusammenarbeit mitbewerten', paragraphs: ['Klären Sie, wer für Rückfragen erreichbar ist und wie Änderungen oder Reklamationen besprochen werden. Ein verständlicher Ablauf erleichtert die Zusammenarbeit besonders dann, wenn sich die Nutzung Ihres Gebäudes verändert.', 'Fragen Sie nur nach Nachweisen, die für Ihr Objekt und Ihre Aufgabe relevant sind, und prüfen Sie diese tatsächlich. Allgemeine Werbeversprechen ersetzen keine konkrete Leistungsvereinbarung. Bei KnaBa beginnt die Abstimmung mit Ihrem Bedarf; den genauen Umfang und Start vereinbaren Sie persönlich.'] },
    ],
    checklist: ['Identische Objektangaben verwenden', 'Leistungen, Flächen und Turnus abgleichen', 'Einmalige Aufgaben von laufenden trennen', 'Preisbestandteile und Ausschlüsse klären', 'Ansprechpartner und Änderungsablauf besprechen'],
    serviceSlug: 'unterhaltsreinigung', readMinutes: 4,
  },
];

export const seoContentUpdated = '2026-10-24';
