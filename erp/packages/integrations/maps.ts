import { z } from 'zod';
import { assert } from '../domain/core.ts';
export interface Coordinates {latitude:number;longitude:number;}
function position(point:Coordinates){assert(Number.isFinite(point.latitude)&&point.latitude>=-90&&point.latitude<=90&&Number.isFinite(point.longitude)&&point.longitude>=-180&&point.longitude<=180,'VALIDATION_ERROR');return {latLng:{latitude:point.latitude,longitude:point.longitude}};}
export function navigationUrl(origin:Coordinates,destination:Coordinates){position(origin);position(destination);const url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('origin',`${origin.latitude},${origin.longitude}`);url.searchParams.set('destination',`${destination.latitude},${destination.longitude}`);url.searchParams.set('travelmode','driving');return url.href;}
export class MapsAdapter {
  constructor(private config?:{apiKey:string;approvalId:string;timeoutMs?:number},private request:typeof fetch=fetch){}
  async route(origin:Coordinates,destination:Coordinates){const navigate=navigationUrl(origin,destination);const fallback={status:'UNAVAILABLE' as const,source:'UNKNOWN' as const,navigation_url:navigate,notice:'Navigation may transfer selected coordinates to Google. ETA is a forecast; recorded work uses server time.'};if(!this.config?.apiKey||!this.config.approvalId)return fallback;
    try {const response=await this.request('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':this.config.apiKey,'X-Goog-FieldMask':'routes.duration,routes.distanceMeters'},body:JSON.stringify({origin:{location:position(origin)},destination:{location:position(destination)},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:false,units:'METRIC'}),signal:AbortSignal.timeout(this.config.timeoutMs??10000)});if(!response.ok)return fallback;
      const parsed=z.object({routes:z.array(z.object({distanceMeters:z.number().int().nonnegative(),duration:z.string().regex(/^\d+(?:\.\d+)?s$/)})).min(1)}).safeParse(await response.json());if(!parsed.success)return fallback;return {status:'AVAILABLE' as const,source:'GOOGLE_ROUTES_ESTIMATE' as const,distance_m:parsed.data.routes[0]!.distanceMeters,eta_seconds:Number(parsed.data.routes[0]!.duration.slice(0,-1)),navigation_url:navigate,notice:fallback.notice};
    }catch{return fallback;}
  }
}
