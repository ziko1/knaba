import {useCallback,useEffect,useRef,useState} from 'react';
import {command,type Session} from './api';
import type {Language} from '../../../packages/i18n/index';
import './BotOperationsPanel.css';

type Provider='WHATSAPP'|'TELEGRAM';
type ReplyMode='HUMAN_FIRST'|'RULE_BASED';
type Policy={
  channel:Provider;defaultLanguage:'DE'|'EN'|'PL'|'LT'|'RU'|'UK';
  workerRequestsEnabled:boolean;partnerRequestsEnabled:boolean;
  humanEscalationEnabled:true;replyMode:ReplyMode;version?:number;providerReady?:boolean;
};
type Interest={id:string;version:number;state:string;source_provider:string;
  received_at:string;needs_portal_identity:boolean};
type Queue={items:Interest[];has_more:boolean};
const providers=['WHATSAPP','TELEGRAM'] as const;
const baseline=(channel:Provider):Policy=>({
  channel,defaultLanguage:'DE',workerRequestsEnabled:true,partnerRequestsEnabled:true,
  humanEscalationEnabled:true,replyMode:'HUMAN_FIRST',version:0,providerReady:false
});
const labels:Record<Language,string>={
  DE:'Bot-Zentrale',EN:'Bot controls',RU:'Управление ботами',
  UK:'Керування ботами',PL:'Zarządzanie botami',LT:'Botų valdymas'
};
export const botOperationsLabel=(language:Language)=>labels[language];
export function canManageBotChannels(actor:{roles:string[];permissions:string[]}){
  return actor.permissions.includes('bot.settings.manage')&&
    actor.roles.some(role=>['OWNER','DIRECTOR','DEVELOPER_SUPPORT'].includes(role));
}
const copy:Record<Language,{
  settings:string;loading:string;refresh:string;save:string;channel:string;language:string;
  worker:string;partner:string;human:string;rules:string;queue:string;review:string;reject:string;
  reason:string;none:string;approvalNote:string;credentials:string;offline:string;
  saved:string;failed:string;limited:string;manual:string
}>={
  DE:{settings:'Kanaleinstellungen',loading:'Laden …',refresh:'Aktualisieren',save:'Einstellungen speichern',channel:'Kanal',language:'Standardsprache',worker:'Mitarbeiteranfragen annehmen',partner:'Partneranfragen annehmen',human:'Mensch übernimmt zuerst',rules:'Freigegebene Antworten, sonst Mensch',queue:'Registrierungsanfragen',review:'Identität prüfen',reject:'Ablehnen',reason:'Prüfgrund',none:'Keine offenen Anfragen',approvalNote:'Die Prüfung vergibt keine Rolle. Die Identität und eine Einladung werden im sicheren Konto bestätigt.',credentials:'Zugangsdaten werden ausschließlich über den geschützten Server hinterlegt. Dieses Formular speichert keine Tokens und aktiviert keinen Anbieter.',offline:'Keine Änderungen ohne Serververbindung.',saved:'Änderung serverseitig bestätigt',failed:'Aktion konnte nicht bestätigt werden',limited:'Nur der freigegebene Inhaber darf Registrierungen prüfen.',manual:'Manuelle Übergabe bleibt verfügbar.'},
  EN:{settings:'Channel settings',loading:'Loading …',refresh:'Refresh',save:'Save preferences',channel:'Channel',language:'Default language',worker:'Accept worker requests',partner:'Accept partner requests',human:'Human first',rules:'Approved replies, then human',queue:'Registration requests',review:'Verify identity',reject:'Reject',reason:'Review reason',none:'No pending requests',approvalNote:'Review grants no role. Identity proof and an invitation must be completed in the secure account.',credentials:'Credentials belong in the protected server configuration. This form stores no tokens and cannot activate a provider.',offline:'Changes require a server connection.',saved:'Server confirmed the update',failed:'The action was not confirmed',limited:'Only an authorized owner can review registration requests.',manual:'Human handoff stays available.'},
  RU:{settings:'Настройки каналов',loading:'Загрузка …',refresh:'Обновить',save:'Сохранить настройки',channel:'Канал',language:'Язык по умолчанию',worker:'Принимать заявки работников',partner:'Принимать заявки партнёров',human:'Сначала оператор',rules:'Согласованные ответы, затем оператор',queue:'Заявки на регистрацию',review:'Проверить личность',reject:'Отклонить',reason:'Причина решения',none:'Новых заявок нет',approvalNote:'Проверка не выдаёт права. Подтверждение личности и приглашение выполняются в защищённом кабинете.',credentials:'Ключи вводятся только через защищённый сервер. Эта форма не хранит токены и не активирует провайдеров.',offline:'Для изменений требуется соединение.',saved:'Сервер подтвердил изменение',failed:'Не удалось подтвердить действие',limited:'Проверять заявки может только уполномоченный владелец.',manual:'Перевод оператору остаётся доступен.'},
  UK:{settings:'Налаштування каналів',loading:'Завантаження …',refresh:'Оновити',save:'Зберегти налаштування',channel:'Канал',language:'Мова за замовчуванням',worker:'Приймати заявки працівників',partner:'Приймати заявки партнерів',human:'Спочатку оператор',rules:'Погоджені відповіді, далі оператор',queue:'Заявки на реєстрацію',review:'Перевірити особу',reject:'Відхилити',reason:'Причина рішення',none:'Нових заявок немає',approvalNote:'Розгляд не надає прав. Особу та запрошення підтверджують у захищеному кабінеті.',credentials:'Ключі додають лише через захищений сервер. Ця форма не зберігає токени та не активує провайдера.',offline:'Для змін потрібне з’єднання із сервером.',saved:'Сервер підтвердив оновлення',failed:'Дію не підтверджено',limited:'Заявки перевіряє тільки уповноважений власник.',manual:'Передача оператору залишається доступною.'},
  PL:{settings:'Ustawienia kanałów',loading:'Ładowanie …',refresh:'Odśwież',save:'Zapisz ustawienia',channel:'Kanał',language:'Język domyślny',worker:'Przyjmuj wnioski pracowników',partner:'Przyjmuj wnioski partnerów',human:'Najpierw operator',rules:'Zatwierdzone odpowiedzi, potem operator',queue:'Wnioski rejestracyjne',review:'Zweryfikuj tożsamość',reject:'Odrzuć',reason:'Powód',none:'Brak wniosków',approvalNote:'Weryfikacja nie nadaje uprawnień. Tożsamość i zaproszenie wymagają bezpiecznego portalu.',credentials:'Klucze przechowuje chroniony serwer. Ten formularz nie zapisuje tokenów.',offline:'Wymagane połączenie.',saved:'Serwer potwierdził',failed:'Nie potwierdzono',limited:'Wnioski sprawdza upoważniony właściciel.',manual:'Kontakt z operatorem pozostaje dostępny.'},
  LT:{settings:'Kanalų nustatymai',loading:'Įkeliama …',refresh:'Atnaujinti',save:'Išsaugoti',channel:'Kanalas',language:'Numatytoji kalba',worker:'Priimti darbuotojų paraiškas',partner:'Priimti partnerių paraiškas',human:'Pirmiausia operatorius',rules:'Patvirtinti atsakymai, tada operatorius',queue:'Registracijos prašymai',review:'Tikrinti tapatybę',reject:'Atmesti',reason:'Priežastis',none:'Naujų prašymų nėra',approvalNote:'Peržiūra nesuteikia teisių. Tapatybę ir kvietimą reikia patvirtinti portale.',credentials:'Raktai saugomi serveryje. Forma nelaiko žetonų.',offline:'Reikia ryšio su serveriu.',saved:'Serveris patvirtino',failed:'Nepatvirtinta',limited:'Prašymus tikrina įgaliotas savininkas.',manual:'Ryšys su operatoriumi galimas.'}
};
export default function BotOperationsPanel({session,language,online}:{
  session:Session;language:Language;online:boolean
}){
  const c=copy[language];
  const [provider,setProvider]=useState<Provider>('WHATSAPP');
  const [state,setState]=useState<Record<Provider,Policy>>({
    WHATSAPP:baseline('WHATSAPP'),TELEGRAM:baseline('TELEGRAM')
  });
  const [queues,setQueues]=useState<{WORKER:Queue;PARTNER:Queue}>({
    WORKER:{items:[],has_more:false},PARTNER:{items:[],has_more:false}
  });
  const [reason,setReason]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [notice,setNotice]=useState('');
  const refreshId=useRef(0);
  const canReview=session.actor.permissions.includes('identity.manage')&&
    session.actor.roles.some(role=>['OWNER','DIRECTOR','OPERATIONS_MANAGER'].includes(role));
  const authorized=canManageBotChannels(session.actor);
  const refresh=useCallback(async()=>{
    if(!authorized)return;
    const request=++refreshId.current;
    setLoading(true);setNotice('');
    try{
      const current=await Promise.all(providers.map(channel=>command('bot.channel.preferences.read',{channel}))) as Policy[];
      if(request!==refreshId.current)return;
      setState({WHATSAPP:current[0],TELEGRAM:current[1]});
      if(canReview){
        const [worker,partner]=await Promise.all([
          command('worker_registration_interest.inbox',{limit:50}),
          command('partner_registration_interest.inbox',{limit:50})
        ]) as Queue[];
        if(request===refreshId.current)setQueues({WORKER:worker,PARTNER:partner});
      }
    }catch(error){
      if(request===refreshId.current)setNotice(error instanceof Error?error.message:c.failed);
    }finally{if(request===refreshId.current)setLoading(false);}
  },[authorized,canReview,c.failed]);
  useEffect(()=>{void refresh();return()=>{refreshId.current++}},[refresh]);
  if(!authorized)return <div role="alert" className="notice danger">{c.limited}</div>;
  const form=state[provider];
  const change=(patch:Partial<Policy>)=>setState(old=>({...old,[provider]:{...old[provider],...patch}}));
  async function save(){
    if(!online||busy)return;
    setBusy(true);setNotice('');
    try{
      const {version:expectedVersion,providerReady:ignoredReady,...input}=form;
      void ignoredReady;
      const result=await command('bot.channel.preferences.configure',input,expectedVersion||undefined) as Policy;
      setState(old=>({...old,[provider]:result}));
      setNotice(c.saved);
    }catch(error){setNotice(error instanceof Error?error.message:c.failed);}
    finally{setBusy(false);}
  }
  async function review(relationship:'WORKER'|'PARTNER',item:Interest,decision:'REVIEW'|'REJECT'){
    const why=reason[item.id]?.trim();
    if(!online||busy||!why)return;
    setBusy(true);setNotice('');
    try{
      await command((relationship==='WORKER'?'worker':'partner')+'_registration_interest.review',{
        id:item.id,decision,reason:why},item.version);
      setReason(old=>({...old,[item.id]:''}));
      await refresh();
      setNotice(c.saved);
    }catch(error){setNotice(error instanceof Error?error.message:c.failed);}
    finally{setBusy(false);}
  }
  return <section className="bot-operations" aria-label={botOperationsLabel(language)}>
    <div className="bot-operations-heading">
      <div><h2>{c.settings}</h2><p>{c.credentials}</p></div>
      <button type="button" className="bot-action secondary" disabled={loading||busy} onClick={()=>void refresh()}>{c.refresh}</button>
    </div>
    {notice&&<p role="status" className="bot-notice">{notice}</p>}
    {!online&&<p role="status" className="bot-notice">{c.offline}</p>}
    {loading?<p role="status">{c.loading}</p>:<>
      <div className="bot-operations-card">
        <div className="bot-tabs" role="tablist" aria-label={c.channel}>
          {providers.map(item=><button type="button" role="tab" aria-selected={provider===item}
            key={item} className={provider===item?'active':''} onClick={()=>setProvider(item)}>{item}</button>)}
        </div>
        <form onSubmit={event=>{event.preventDefault();void save()}}>
          <div className="bot-fields">
            <label>{c.language}<select value={form.defaultLanguage}
              onChange={event=>change({defaultLanguage:event.target.value as Policy['defaultLanguage']})}>
              {['DE','EN','PL','LT','RU','UK'].map(item=><option key={item} value={item}>{item}</option>)}
            </select></label>
            <label>{c.channel}<select value={form.replyMode}
              onChange={event=>change({replyMode:event.target.value as ReplyMode})}>
              <option value="HUMAN_FIRST">{c.human}</option>
              <option value="RULE_BASED">{c.rules}</option>
            </select></label>
          </div>
          <label className="bot-check"><input type="checkbox" checked={form.workerRequestsEnabled}
            onChange={event=>change({workerRequestsEnabled:event.target.checked})}/>{c.worker}</label>
          <label className="bot-check"><input type="checkbox" checked={form.partnerRequestsEnabled}
            onChange={event=>change({partnerRequestsEnabled:event.target.checked})}/>{c.partner}</label>
          <p className="bot-muted">{c.manual}</p>
          <button className="bot-action" type="submit" disabled={!online||busy}>{c.save}</button>
        </form>
      </div>
      {canReview&&<div className="bot-operations-card">
        <h3>{c.queue}</h3><p className="bot-muted">{c.approvalNote}</p>
        {(['WORKER','PARTNER'] as const).map(relationship=><section key={relationship} aria-label={relationship}>
          <h4>{relationship==='WORKER'?c.worker:c.partner}</h4>
          {queues[relationship].items.length===0&&<p className="bot-muted">{c.none}</p>}
          {queues[relationship].items.map(item=><article key={item.id} className="bot-request">
            <div className="bot-request-meta"><strong>{item.source_provider}</strong><span>{item.state}</span>
              <time dateTime={item.received_at}>{new Date(item.received_at).toLocaleDateString(language.toLowerCase())}</time></div>
            <label>{c.reason}<input required value={reason[item.id]??''} maxLength={2000}
              onChange={event=>setReason(old=>({...old,[item.id]:event.target.value}))}/></label>
            <div className="bot-request-actions">
              <button type="button" className="bot-action" disabled={!online||busy||!(reason[item.id]??'').trim()}
                onClick={()=>void review(relationship,item,'REVIEW')}>{c.review}</button>
              <button type="button" className="bot-action secondary" disabled={!online||busy||!(reason[item.id]??'').trim()}
                onClick={()=>void review(relationship,item,'REJECT')}>{c.reject}</button>
            </div>
          </article>)}
        </section>)}
      </div>}
    </>}
  </section>;
}
