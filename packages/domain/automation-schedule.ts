import {z} from 'zod';
import {assert} from './core.js';

/** One daily or weekly wall-clock schedule, interpreted only in Europe/Berlin. */
export const AUTOMATION_CRON_PATTERN=/^\s*(?:[0-5]?[0-9])\s+(?:[01]?[0-9]|2[0-3])\s+\*\s+\*\s+(?:\*|[0-6])\s*$/;
export const AUTOMATION_CRON_DESCRIPTION='Europe/Berlin: minute 0–59, hour 0–23, * day, * month, weekday * or 0–6 (Sunday=0). Example: 0 18 * * *.';
export interface AutomationCron {cron:string;minute:number;hour:number;weekday:number|null;timeZone:'Europe/Berlin';}

export function parseAutomationCron(value:unknown):AutomationCron {
 assert(typeof value==='string'&&value.length<=100&&AUTOMATION_CRON_PATTERN.test(value),'AUTOMATION_SCHEDULE_UNSUPPORTED',{field:'schedule.cron',supported:AUTOMATION_CRON_DESCRIPTION});
 const cron=value.trim().replace(/\s+/g,' '),fields=cron.split(' ');
 return {cron,minute:Number(fields[0]),hour:Number(fields[1]),weekday:fields[4]==='*'?null:Number(fields[4]),timeZone:'Europe/Berlin'};
}

// The preprocessor preserves the domain error before Engine persistence. The inner
// string schema also publishes the exact pattern to API JSON-schema consumers.
export const automationCronSchema=z.preprocess(value=>parseAutomationCron(value).cron,z.string().max(100).regex(AUTOMATION_CRON_PATTERN).describe(AUTOMATION_CRON_DESCRIPTION));

/** Revalidate stored versions as well as new input; absent cron is event-only. */
export function validateAutomationSchedule(value:unknown):{timezone:'Europe/Berlin';cron?:string}|undefined {
 if(value===undefined)return undefined;
 assert(value!==null&&typeof value==='object'&&!Array.isArray(value),'AUTOMATION_SCHEDULE_UNSUPPORTED',{field:'schedule'});
 const schedule=value as Record<string,unknown>;
 assert(Object.keys(schedule).every(key=>key==='timezone'||key==='cron')&&(schedule.timezone===undefined||schedule.timezone==='Europe/Berlin'),'AUTOMATION_SCHEDULE_UNSUPPORTED',{field:'schedule.timezone'});
 return {timezone:'Europe/Berlin',...(schedule.cron===undefined?{}:{cron:parseAutomationCron(schedule.cron).cron})};
}

/** DST uses real instants and local wall time; worker deduplication owns repeats. */
export function automationScheduleDue(cron:unknown,now:Date):boolean {
 const schedule=parseAutomationCron(cron);
 assert(now instanceof Date&&Number.isFinite(now.getTime()),'AUTOMATION_SCHEDULE_UNSUPPORTED',{reason:'INVALID_SCHEDULER_INSTANT'});
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:schedule.timeZone,hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]));
 const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday!);
 return Number(parts.hour)===schedule.hour&&Number(parts.minute)===schedule.minute&&(schedule.weekday===null||schedule.weekday===weekday);
}
