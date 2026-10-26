import { isIP } from 'node:net';

const maxForwardedHops=16;

/** Canonical IP literals only: never hostnames, ports, CIDRs or scoped addresses. */
function normalizeAddress(value){
  if(typeof value!=='string'||value.includes('%'))return null;
  const address=value.trim();
  const family=isIP(address);
  if(!family)return null;
  if(family===4)return address;
  const canonical=new URL('http://['+address+']/').hostname.slice(1,-1);
  const mapped=/^::ffff:([a-f\d]{1,4}):([a-f\d]{1,4})$/.exec(canonical);
  if(mapped){
    const high=parseInt(mapped[1],16),low=parseInt(mapped[2],16);
    return [high>>>8,high&255,low>>>8,low&255].join('.');
  }
  return canonical;
}

/**
 * Trust is explicit and empty by default. Configure only the immediate proxy
 * IPs verified on the private network, never every peer in a Docker subnet.
 * The edge must append its actual socket peer to X-Forwarded-For (or overwrite
 * that header). Walk right-to-left so a client-supplied left prefix is ignored.
 */
export function createClientAddressResolver(trustedProxyIps=[]){
  if(!Array.isArray(trustedProxyIps))throw Error('Trusted proxy IPs must be an array.');
  const trusted=new Set(trustedProxyIps.map(value=>{
    const address=normalizeAddress(value);
    if(!address)throw Error('Trusted proxy configuration requires exact IP literals.');
    return address;
  }));
  return req=>{
    const peer=normalizeAddress(req.socket?.remoteAddress)||'unknown';
    if(!trusted.has(peer))return peer;
    const forwarded=req.headers['x-forwarded-for'];
    if(typeof forwarded!=='string'||forwarded.length>1024)return peer;
    const values=forwarded.split(',');
    if(values.length>maxForwardedHops)return peer;
    const chain=values.map(normalizeAddress);
    if(chain.some(value=>!value))return peer;
    let address=peer;
    for(let index=chain.length-1;index>=0&&trusted.has(address);index--)
      address=chain[index];
    return address;
  };
}
