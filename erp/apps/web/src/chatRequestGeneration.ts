import {PrivateReadGeneration,type PrivateReadTicket} from './privateReadGeneration';

export interface ChatRequestTicket extends PrivateReadTicket {readonly channelId:string}
/** A delayed callback from one conversation cannot start reads or apply state
 * in another conversation, even if it obtains a fresh request sequence later. */
export class ChatRequestGeneration {
 private channelId='';
 private reads=new PrivateReadGeneration();
 mount(){return this.reads.mount()}
 unmount(){this.reads.unmount()}
 selectChannel(channelId:string){
  if(channelId===this.channelId)return false;
  this.channelId=channelId;
  if(this.reads.enabled){this.reads.unmount();this.reads.mount()}
  return true;
 }
 begin(channelId:string,lane:string):ChatRequestTicket|undefined{
  if(!channelId||channelId!==this.channelId)return;
  const ticket=this.reads.begin(lane);return ticket?{...ticket,channelId}:undefined;
 }
 accepts(ticket:ChatRequestTicket){return ticket.channelId===this.channelId&&this.reads.accepts(ticket)}
 update<T>(ticket:ChatRequestTicket,change:(previous:T)=>T):(previous:T)=>T{return previous=>this.accepts(ticket)?change(previous):previous}
 invalidate(){this.reads.invalidate()}
}
