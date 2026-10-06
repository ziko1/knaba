export interface PrivateReadTicket {readonly generation:number;readonly sequence:number;readonly lane:string;readonly signal:AbortSignal}
/** An authority boundary, not an authorization decision. A new instance may be
 * created only after the application adopts a fresh server Session. Invalidation
 * is permanent so a reconnect cannot reuse old roles or scopes. */
export class PrivateReadGeneration {
 private generation=0;
 private authorized=true;
 private revoked=false;
 private lanes=new Map<string,{sequence:number;controller:AbortController}>();
 get enabled(){return this.authorized;}
 /** React development StrictMode replays effect setup/cleanup for the same
  * adopted Session. Lifecycle attachment may resume that Session only if no
  * terminal revocation/logout has occurred. It never re-enables a revoked gate. */
 mount(){if(this.revoked)return false;this.authorized=true;this.generation++;return true;}
 unmount(){this.stop();}
 begin(lane:string):PrivateReadTicket|undefined {
  if(!this.authorized)return undefined;
  const previous=this.lanes.get(lane);previous?.controller.abort();
  const current={sequence:(previous?.sequence??0)+1,controller:new AbortController()};this.lanes.set(lane,current);
  return {generation:this.generation,sequence:current.sequence,lane,signal:current.controller.signal};
 }
 accepts(ticket:PrivateReadTicket){return this.authorized&&ticket.generation===this.generation&&this.lanes.get(ticket.lane)?.sequence===ticket.sequence&&!ticket.signal.aborted;}
 /** The check runs when React actually applies the state update, including an
  * update enqueued before revocation but applied afterwards. */
 update<T>(ticket:PrivateReadTicket,change:(previous:T)=>T):(previous:T)=>T{return previous=>this.accepts(ticket)?change(previous):previous;}
 private stop(){this.authorized=false;this.generation++;for(const lane of this.lanes.values())lane.controller.abort();this.lanes.clear();}
 invalidate(){this.revoked=true;this.stop();}
}
