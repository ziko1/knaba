import {BlockList,isIP} from 'node:net';

/** One canonical address; never accept a header list, port, zone ID or hostname. */
export function normalizeClientIp(value){
  if(typeof value!=='string'||value.length>45||value.includes('%'))return null;
  const family=isIP(value);
  if(family===4)return value;
  if(family!==6)return null;
  const canonical=new URL('http://['+value+']/').hostname.slice(1,-1);
  const mapped=/^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if(!mapped)return canonical;
  const high=parseInt(mapped[1],16),low=parseInt(mapped[2],16);
  return [high>>>8,high&255,low>>>8,low&255].join('.');
}

/** Compile explicit peer IP/CIDR configuration once, before opening the DB. */
export function createClientIpResolver(configuration=''){
  const invalid=()=>{throw Error('Invalid KNABA_TRUSTED_PROXY_IPS configuration.');};
  if(typeof configuration!=='string'||configuration.length>4096)invalid();
  const entries=configuration.trim()?configuration.split(',').map(value=>value.trim()):[];
  if(entries.length>32)invalid();
  const peers=new BlockList();
  for(const entry of entries){
    const parts=entry.split('/');
    const address=normalizeClientIp(parts[0]);
    if(!address||parts.length>2)invalid();
    const type=isIP(address)===4?'ipv4':'ipv6';
    if(parts.length===1){peers.addAddress(address,type);continue;}
    if(!/^(?:[1-9][0-9]{0,2})$/.test(parts[1]))invalid();
    let prefix=Number(parts[1]);
    const inputBits=isIP(parts[0])===4?32:128;
    if(prefix>inputBits)invalid();
    // Mapped IPv6 CIDRs must remain wholly within the mapped IPv4 space.
    if(inputBits===128&&type==='ipv4')prefix-=96;
    if(prefix<1)invalid();
    peers.addSubnet(address,prefix,type);
  }
  return request=>{
    const peer=normalizeClientIp(request.socket?.remoteAddress);
    if(!peer)return 'unknown'; // Stable nonempty bucket when the socket is unavailable.
    if(!peers.check(peer,isIP(peer)===4?'ipv4':'ipv6'))return peer;
    // Cloudflare overwrites this header at the edge. The immediate configured
    // peer must preserve it; XFF/Forwarded/X-Real-IP never establish trust here.
    return normalizeClientIp(request.headers?.['cf-connecting-ip'])||peer;
  };
}
