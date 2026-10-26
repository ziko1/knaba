import {createSignal, Show} from 'solid-js';

export default function WorkerInvitePanel(props:{locale:'de'|'en'|'uk'|'ru'}){
 const [busy,setBusy]=createSignal(false);
 const [code,setCode]=createSignal('');
 const [error,setError]=createSignal('');
 const labels={
  de:['Mitarbeitende einladen','Einmaligen Einladungscode erstellen','7 Tage gültig · einmal verwendbar','Code konnte nicht erstellt werden.'],en:['Invite staff','Generate one-use invite code','Valid 7 days · one use only','Code could not be generated.'],
  uk:['Запросити працівника','Створити одноразовий код','Дійсний 7 днів · один раз','Не вдалося створити код.'],
  ru:['Пригласить сотрудника','Создать одноразовый код','Действует 7 дней · один раз','Не удалось создать код.']
 }[props.locale];
 async function create(){
  if(busy())return;
  setBusy(true);setError('');setCode('');
  try{
   const response=await fetch('/auth/invites',{method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json'},body:'{}'});
   if(!response.ok)throw Error('Denied');
   const data=await response.json() as {code:string};
   if(!/^[A-Za-z0-9_-]{24}$/.test(data.code))throw Error('Bad invite');
   setCode(data.code);
  }catch{setError(labels[3]);}
  finally{setBusy(false);}
 }
 return <section class="kncc-invite" aria-label={labels[0]}>
   <div><strong>{labels[0]}</strong><p>{labels[2]}</p></div>
   <button type="button" onClick={()=>void create()} disabled={busy()}>{labels[1]}</button>
   <Show when={code()}><label>Code<input aria-label="Staff invite code" readonly value={code()} onclick={e=>e.currentTarget.select()}/></label></Show>
   <Show when={error()}><p role="alert">{error()}</p></Show>
 </section>;
}
