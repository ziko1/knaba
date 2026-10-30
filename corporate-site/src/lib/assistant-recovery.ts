/** A code is a bearer credential. Only display or copy it after user action. */
export type AssistantTicket={id:string;token:string};
const pattern=/^KNABA1:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{64})$/i;
export function parseRecoveryCode(raw:string):AssistantTicket|null {
  if(typeof raw!=='string'||raw.length>140)return null;
  const found=raw.trim().match(pattern);
  return found?{id:found[1].toLowerCase(),token:found[2].toLowerCase()}:null;
}
export function formatRecoveryCode(ticket:AssistantTicket):string {
  const code=`KNABA1:${ticket.id}:${ticket.token}`;
  if(!parseRecoveryCode(code))throw new TypeError('Invalid KNABA conversation credentials');
  return code;
}
