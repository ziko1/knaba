import {languages,statusLabel,translator,type Language} from '../../../packages/i18n/index';
import type {ReportRemainingTaskRow} from '../../../packages/domain/report-remaining-scope';
import './ReportRemainingScope.css';

const text={
 title:['Restumfang','Залишок робіт','Остаток работ','Pozostały zakres','Likusi darbų apimtis','Remaining scope'],
 notice:['Stand dieser Berichtsversion. Noch nicht abgenommene Mengen sind keine zusätzlich berechneten Leistungen.','Стан на момент цієї версії звіту. Неприйнятий обсяг не є додатковим нарахуванням.','Состояние этой версии отчёта. Непринятый объём не является дополнительным начислением.','Stan tej wersji raportu. Nieodebrane ilości nie stanowią dodatkowych opłat.','Šios ataskaitos versijos duomenys. Nepriimti kiekiai nėra papildomai apmokestinti darbai.','Snapshot of this report version. Quantities awaiting acceptance are not additional charges.'],
 planned:['Geplant','Заплановано','Запланировано','Plan','Suplanuota','Planned'],
 accepted:['Abgenommen','Прийнято','Принято','Odebrano','Priimta','Accepted'],
 remaining:['Noch nicht abgenommen','Ще не прийнято','Ещё не принято','Jeszcze nieodebrane','Dar nepriimta','Awaiting acceptance'],
 empty:['Keine offenen Arbeiten in dieser Berichtsversion.','У цій версії звіту немає залишку робіт.','В этой версии отчёта нет остатка работ.','W tej wersji raportu nie ma pozostałych prac.','Šioje ataskaitos versijoje likusių darbų nėra.','No remaining work in this report version.']
};

export default function ReportRemainingScope({rows,language}:{rows?:ReportRemainingTaskRow[];language:Language}){
 // Legacy immutable reports predate this field; absence is unknown, not zero.
 if(!Array.isArray(rows))return null;
 const index=languages.indexOf(language),t=translator(language),copy=(key:keyof typeof text)=>text[key][index];
 const quantity=(value:number)=>new Intl.NumberFormat(language==='UK'?'uk':language.toLowerCase(),{maximumFractionDigits:3}).format(value/1000);
 return <section className="report-remaining-scope" aria-label={copy('title')}>
  <h3>{copy('title')}</h3><p className="muted">{copy('notice')}</p>
  {rows.length?<ul>{rows.map(row=><li key={row.taskId}>
   <strong>{row.descriptionDe||row.taskId}</strong><span>{statusLabel(row.state,t)}</span>
   <dl>{(['planned','accepted','remaining'] as const).map((key,i)=><div key={key}><dt>{copy(key)}</dt><dd>{quantity([row.plannedQuantityMilli,row.acceptedQuantityMilli,row.remainingQuantityMilli][i])} {row.unit}</dd></div>)}</dl>
  </li>)}</ul>:<p>{copy('empty')}</p>}
 </section>;
}
