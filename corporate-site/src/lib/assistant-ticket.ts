import {parseRecoveryCode,type AssistantTicket} from './assistant-recovery';
import {sameAssistantTicket} from './assistant-request-state';

export const ASSISTANT_TICKET_STORAGE='knaba-assistant-ticket-v1';
const INQUIRY_TICKET_STORAGE='knaba-assistant-inquiry-ticket-v1';
type TicketStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

/** Only the bearer is stored, never a form draft, contact details or consent. */
export function createAssistantTicketStore(storage:()=>TicketStorage){
  let generation=0,failed=false;
  const listeners=new Set<()=>void>();
  const changed=()=>{generation++;for(const notify of listeners)notify();};
  const read=(key:string):AssistantTicket|null=>{
    if(failed)return null;
    try{
      const value=JSON.parse(storage().getItem(key)||'null');
      return value&&typeof value.id==='string'&&typeof value.token==='string'
        ?parseRecoveryCode(`KNABA1:${value.id}:${value.token}`):null;
    }catch{return null;}
  };
  const current=()=>read(ASSISTANT_TICKET_STORAGE);
  const captured=()=>{
    const value=read(INQUIRY_TICKET_STORAGE);
    return value&&sameAssistantTicket(current(),value)?value:null;
  };
  return {
    current,captured,
    write(ticket:AssistantTicket|null):boolean{
      failed=true;
      try{
        const target=storage();target.removeItem(INQUIRY_TICKET_STORAGE);
        if(ticket){
          const valid=parseRecoveryCode(`KNABA1:${ticket.id}:${ticket.token}`);
          if(!valid)throw Error('Invalid conversation capability');
          target.setItem(ASSISTANT_TICKET_STORAGE,JSON.stringify(valid));
        }else target.removeItem(ASSISTANT_TICKET_STORAGE);
        failed=false;
      }catch{}
      changed();return !failed;
    },
    capture(ticket:AssistantTicket):boolean{
      if(!sameAssistantTicket(current(),ticket))return false;
      try{
        storage().setItem(INQUIRY_TICKET_STORAGE,JSON.stringify({id:ticket.id,token:ticket.token}));
        return sameAssistantTicket(captured(),ticket);
      }catch{return false;}
    },
    checkpoint(ticket:AssistantTicket){
      const started=generation;
      return ()=>started===generation&&sameAssistantTicket(captured(),ticket);
    },
    subscribe(notify:()=>void){listeners.add(notify);return ()=>listeners.delete(notify);},
  };
}
export const assistantTickets=createAssistantTicketStore(()=>sessionStorage);
