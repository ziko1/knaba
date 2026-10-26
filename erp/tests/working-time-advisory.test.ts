import { describe, expect, it } from 'vitest';
import { operationsCommands } from '../packages/domain/operations.ts';
import { evaluateWorkingTimeAdvisory, workingTimePolicySchema, type AdvisorySegment, type AdvisoryShift, type WorkingTimeAdvisoryInput } from '../packages/domain/working-time-advisory.ts';
import { assert, DomainError, type Actor, type CommandContext, type Data, type Entity, type Transaction } from '../packages/domain/core.ts';

const HOUR = 3600;
const source = (kind: string, id: string, version = 1) => ({ kind, id, version });
function day(parts: [string, number][], startAt = '2026-10-05T08:00:00Z', approvedTravel?: 'COUNT' | 'EXCLUDE' | 'UNRESOLVED'): WorkingTimeAdvisoryInput {
  let cursor = Date.parse(startAt);
  const segments: AdvisorySegment[] = parts.map(([activity, seconds], index) => {
    const start = cursor; cursor += seconds * 1000;
    return { id: 'segment-' + index, shiftId: 'shift', activity, startAt: new Date(start).toISOString(), endAt: new Date(cursor).toISOString(), source: source('time_segment','segment-' + index) };
  });
  return { employeeId: 'employee', now: new Date(cursor + HOUR * 1000).toISOString(), focusStart: new Date(Date.parse(startAt)).toISOString(), focusEnd: new Date(cursor).toISOString(), segments, shifts: [{ id: 'shift', startAt, endAt: new Date(cursor).toISOString(), source: source('shift','shift') }],
    ...(approvedTravel ? { policy: workingTimePolicySchema.parse({ travel: approvedTravel }), policySource: source('legal_approval','SYNTHETIC_WORKING_TIME_REVIEW') } : {}) };
}
const codes = (result: ReturnType<typeof evaluateWorkingTimeAdvisory>) => result.warnings.map(warning => warning.code);

describe('deterministic general-regime working-time advisories; no legal certification', () => {
  it.each([[6 * HOUR, false, false], [6 * HOUR + 1, true, false], [8 * HOUR, true, false], [8 * HOUR + 1, true, true]] as const)(
    'strict boundaries for %i recorded seconds: mandatory break=%s extended day=%s', (duration, breakRequired, extension) => {
      const result = evaluateWorkingTimeAdvisory(day([['WORKING', duration]]));
      expect(codes(result).includes('MANDATORY_BREAK_SHORTFALL')).toBe(breakRequired);
      expect(codes(result).includes('DAILY_WORK_OVER_8_HOURS_REQUIRES_AVERAGING')).toBe(extension);
      expect(result.status).toBe('ADVISORY_ONLY_REQUIRES_LEGAL_REVIEW');
      expect(result.effects).toEqual({ payrollChanged: false, actualIntervalsChanged: false, automaticDiscipline: false, gpsActivated: false });
    });
  it.each([[10 * HOUR, false], [10 * HOUR + 1, true]] as const)('ten-hour limit records rather than deletes %i actual seconds', (duration, exceeded) => {
    const input = day([['WORKING', duration]]), original = structuredClone(input), result = evaluateWorkingTimeAdvisory(input);
    expect(codes(result).includes('DAILY_WORK_OVER_10_HOURS')).toBe(exceeded);
    expect(result.dutyDays[0]!.workSeconds).toBe(duration); expect(input).toEqual(original);
  });
  it('credits separated fifteen-minute breaks and merges adjacent pieces of the same physical break', () => {
    const result = evaluateWorkingTimeAdvisory(day([['WORKING',3*HOUR],['ON_BREAK',600],['ON_BREAK',300],['WORKING',3*HOUR],['ON_BREAK',900],['WORKING',2*HOUR]]));
    expect(result.dutyDays[0]).toMatchObject({ workSeconds:8*HOUR, qualifyingBreakSeconds:1800, requiredBreakSeconds:1800 });
    expect(codes(result)).not.toContain('MANDATORY_BREAK_SHORTFALL'); expect(codes(result)).not.toContain('BREAK_PART_UNDER_15_MINUTES'); expect(codes(result)).not.toContain('CONTINUOUS_WORK_OVER_6_HOURS');
  });
  it('three separate ten-minute pauses do not replace statutory break parts or reset continuous work', () => {
    const result = evaluateWorkingTimeAdvisory(day([['WORKING',3*HOUR],['ON_BREAK',600],['WORKING',3*HOUR],['ON_BREAK',600],['WORKING',2*HOUR],['ON_BREAK',600]]));
    expect(result.dutyDays[0]!.qualifyingBreakSeconds).toBe(0);
    expect(codes(result)).toEqual(expect.arrayContaining(['BREAK_PART_UNDER_15_MINUTES','MANDATORY_BREAK_SHORTFALL','CONTINUOUS_WORK_OVER_6_HOURS']));
  });
  it.each([[9*HOUR,1800],[9*HOUR+1,2700]] as const)('nine-hour boundary requires %i seconds work and %i seconds pause', (work, required) => {
    const result = evaluateWorkingTimeAdvisory(day([['WORKING',5*HOUR],['ON_BREAK',1800],['WORKING',work-5*HOUR]]));
    expect(result.dutyDays[0]!.requiredBreakSeconds).toBe(required);
    expect(codes(result).includes('MANDATORY_BREAK_SHORTFALL')).toBe(required===2700);
  });
  it('a late thirty-minute lunch cannot erase six continuous hours already worked', () => {
    const result = evaluateWorkingTimeAdvisory(day([['WORKING',6*HOUR+1],['ON_BREAK',1800],['WORKING',HOUR]]));
    expect(codes(result)).not.toContain('MANDATORY_BREAK_SHORTFALL'); expect(codes(result)).toContain('CONTINUOUS_WORK_OVER_6_HOURS');
  });
  it('ending and restarting adjacent shifts cannot reset six continuous physical working hours', () => {
    const input=day([['WORKING',3*HOUR],['WORKING',4*HOUR]]), boundary=input.segments[1]!.startAt;
    input.segments[1]!.shiftId='second';input.shifts[0]!.endAt=boundary;
    input.shifts.push({id:'second',startAt:boundary,endAt:input.focusEnd,source:source('shift','second')});
    const result=evaluateWorkingTimeAdvisory(input);
    expect(codes(result)).toContain('CONTINUOUS_WORK_ACROSS_SHIFT_BOUNDARY_OVER_6_HOURS');
    expect(codes(result)).toContain('REST_UNDER_11_HOURS');expect(result.dutyDays[0]!.workSeconds).toBe(7*HOUR);
  });
  it.each([['ON_BREAK',600,undefined,true,false],['ON_BREAK',900,undefined,false,false],['TRAVELLING',600,'EXCLUDE',true,false],['AWAY_PENDING_REASON',600,undefined,false,true]] as const)(
    'cross-shift %s %i-second interruption keeps qualifying-break classification', (activity,pause,travel,conclusive,possible) => {
      const input=day([['WORKING',3.5*HOUR],[activity,pause],['WORKING',3.5*HOUR]],undefined,travel), boundary=input.segments[2]!.startAt;
      input.segments[2]!.shiftId='second';input.shifts[0]!.endAt=boundary;
      input.shifts.push({id:'second',startAt:boundary,endAt:input.focusEnd,source:source('shift','second')});
      const result=evaluateWorkingTimeAdvisory(input);
      expect(codes(result).includes('CONTINUOUS_WORK_ACROSS_SHIFT_BOUNDARY_OVER_6_HOURS')).toBe(conclusive);
      expect(codes(result).includes('POSSIBLE_CONTINUOUS_WORK_OVER_6_HOURS')).toBe(possible);
      if(conclusive)expect(result.warnings.find(warning=>warning.code==='CONTINUOUS_WORK_ACROSS_SHIFT_BOUNDARY_OVER_6_HOURS')!.recordedContinuousSeconds).toBe(7*HOUR);
    });
  it('unknown travel is a range requiring classification; an approved excluded journey is never invented as a break', () => {
    const parts: [string,number][] = [['WORKING',3.5*HOUR],['TRAVELLING',2*HOUR],['WORKING',3.5*HOUR]];
    const unresolved = evaluateWorkingTimeAdvisory(day(parts)), counted = evaluateWorkingTimeAdvisory(day(parts,undefined,'COUNT')), excluded = evaluateWorkingTimeAdvisory(day(parts,undefined,'EXCLUDE'));
    expect(unresolved.dutyDays[0]).toMatchObject({ workSeconds:7*HOUR, unresolvedSeconds:2*HOUR });
    expect(codes(unresolved)).toContain('ACTIVITY_CLASSIFICATION_UNRESOLVED');
    expect(counted.dutyDays[0]).toMatchObject({ workSeconds:9*HOUR, unresolvedSeconds:0 });
    expect(excluded.dutyDays[0]).toMatchObject({ workSeconds:7*HOUR, qualifyingBreakSeconds:0 }); expect(codes(excluded)).toContain('CONTINUOUS_WORK_OVER_6_HOURS');
  });
  it('GPS stale/unknown metadata does not turn recorded work into absence or payroll deduction', () => {
    const input = day([['WORKING',7*HOUR],['ON_BREAK',1800]]);
    Object.assign(input.segments[0]!, { trackerState:'STALE',geoState:'UNKNOWN',latitude:52.5,privateReason:'PRIVATE_CANARY' });
    const result = evaluateWorkingTimeAdvisory(input); expect(result.dutyDays[0]!.workSeconds).toBe(7*HOUR);
    expect(JSON.stringify(result)).not.toContain('latitude'); expect(JSON.stringify(result)).not.toContain('PRIVATE_CANARY');
  });
  it.each([
    ['spring','2026-03-29T01:30:00+01:00','2026-03-29T03:30:00+02:00'],
    ['autumn','2026-10-25T02:30:00+02:00','2026-10-25T02:30:00+01:00']
  ] as const)('UTC elapsed work remains one hour through %s DST transition', (_name,start,end) => {
    const input = day([['WORKING',HOUR]],start); input.segments[0]!.endAt=end; input.shifts[0]!.endAt=end; input.focusEnd=new Date(end).toISOString();
    expect(evaluateWorkingTimeAdvisory(input).dutyDays[0]!.workSeconds).toBe(HOUR);
  });
  it('crossing midnight keeps the full ten-hour duty and flags night/Sunday applicability', () => {
    const result = evaluateWorkingTimeAdvisory(day([['WORKING',10*HOUR]],'2026-10-24T22:00:00+02:00'));
    expect(result.dutyDays[0]!.workSeconds).toBe(10*HOUR); expect(codes(result)).toContain('DAILY_WORK_OVER_8_HOURS_REQUIRES_AVERAGING');
    expect(codes(result)).toEqual(expect.arrayContaining(['NIGHT_WORK_APPLICABILITY_REVIEW','SUNDAY_WORK_APPLICABILITY_REVIEW']));
  });
  it.each([[11*HOUR,false],[11*HOUR-1,true]] as const)('inter-shift rest is %i elapsed seconds independent of local dates', (rest,shortfall) => {
    const input = day([['WORKING',8*HOUR]],'2026-10-24T08:00:00+02:00'), prior=input.shifts[0]!, nextStart=new Date(Date.parse(prior.endAt!)+rest*1000).toISOString(), nextEnd=new Date(Date.parse(nextStart)+HOUR*1000).toISOString();
    input.shifts.push({id:'next',startAt:nextStart,endAt:nextEnd,source:source('shift','next')});
    input.segments.push({id:'next-work',shiftId:'next',activity:'WORKING',startAt:nextStart,endAt:nextEnd,source:source('time_segment','next-work')});
    input.focusStart=nextStart; input.focusEnd=nextEnd; input.now=nextEnd;
    const result=evaluateWorkingTimeAdvisory(input); expect(result.rests[0]!.restSeconds).toBe(rest); expect(codes(result).includes('REST_UNDER_11_HOURS')).toBe(shortfall);
  });
  it('sparse old shifts never imply complete historical average coverage', () => {
    const input=day([['WORKING',8*HOUR]]); input.segments.unshift({id:'old',shiftId:'old-shift',activity:'WORKING',startAt:'2026-04-01T08:00:00Z',endAt:'2026-04-01T16:00:00Z',source:source('time_segment','old')});
    const result=evaluateWorkingTimeAdvisory(input);
    expect(result.averaging.every(window=>window.averageSecondsPerWorkingDay===null&&window.exceeds8Hours===null)).toBe(true); expect(result.averagingEvidence).toBe('INSUFFICIENT_HISTORY');
  });
  it('accepts complete approved recorded coverage of either window, and rejects a one-second coverage gap', () => {
    const input=day([['WORKING',8*HOUR]],'2026-10-05T06:00:00Z','COUNT'); input.now='2026-10-06T12:00:00Z';
    const blank=evaluateWorkingTimeAdvisory(input), start=blank.averaging[0]!.startAt,end=blank.averaging[0]!.endAt;
    input.coverage=[{startAt:start,endAt:end,source:source('timesheet','approved-period')}];
    const complete=evaluateWorkingTimeAdvisory(input); expect(complete.averaging[0]!.coverage).toBe('APPROVED_RECORDED_PERIOD_COMPLETE'); expect(complete.averaging[1]!.coverage).toBe('INSUFFICIENT_HISTORY');
    expect(complete.averagingEvidence).toBe('RECORDED_HISTORY_SUPPORTS_AVERAGE_ONLY'); expect(complete.status).toContain('REQUIRES_LEGAL_REVIEW');
    const split=Date.parse(start)+HOUR*1000;
    input.coverage=[{startAt:start,endAt:new Date(split).toISOString(),source:source('timesheet','first')},{startAt:new Date(split+1000).toISOString(),endAt:end,source:source('timesheet','second')}];
    expect(evaluateWorkingTimeAdvisory(input).averaging[0]!.averageSecondsPerWorkingDay).toBeNull();
  });
  it('uses calendar-month clamping and Berlin midnights across summer/winter offsets rather than 180 elapsed days', () => {
    const input=day([['WORKING',HOUR]],'2026-10-30T08:00:00Z'); input.now='2026-10-31T12:00:00Z';
    const result=evaluateWorkingTimeAdvisory(input);
    expect(result.averaging[1]).toMatchObject({startAt:'2026-04-29T22:00:00.000Z',endAt:'2026-10-30T23:00:00.000Z'});
    expect(result.averaging[0]).toMatchObject({startAt:'2026-05-15T22:00:00.000Z',endAt:'2026-10-30T23:00:00.000Z'});
  });
  it('pending or open classifications invalidate averaging despite fully covered approved periods', () => {
    const input=day([['AWAY_PENDING_REASON',HOUR],['WORKING',7*HOUR]]); input.now='2026-10-06T12:00:00Z';
    const baseline=evaluateWorkingTimeAdvisory(input); input.coverage=[{startAt:baseline.averaging[1]!.startAt,endAt:baseline.averaging[1]!.endAt,source:source('timesheet','covered')}];
    expect(evaluateWorkingTimeAdvisory(input).averagingEvidence).toBe('INSUFFICIENT_HISTORY');
    input.segments[0]!.activity='WORKING';input.incompleteHistory=true;
    expect(evaluateWorkingTimeAdvisory(input).averagingEvidence).toBe('INSUFFICIENT_HISTORY');
  });
  it('configured state holiday evidence generates a holiday review, and no unreviewed exception suppresses limits', () => {
    const input=day([['WORKING',10*HOUR+1]],'2026-10-05T06:00:00Z','COUNT');
    input.policy=workingTimePolicySchema.parse({travel:'COUNT',federalState:'BE',holidayDates:['2026-10-05'],holidayCoverageFrom:'2026-01-01',holidayCoverageTo:'2026-12-31'});
    const result=evaluateWorkingTimeAdvisory(input);expect(codes(result)).toContain('PUBLIC_HOLIDAY_WORK_APPLICABILITY_REVIEW');expect(codes(result)).not.toContain('FEDERAL_STATE_HOLIDAY_CALENDAR_INCOMPLETE');expect(codes(result)).toContain('DAILY_WORK_OVER_10_HOURS');
    expect(()=>workingTimePolicySchema.parse({travel:'COUNT',maxDailyHours:24})).toThrow();
    expect(()=>workingTimePolicySchema.parse({holidayDates:['2026-13-01']})).toThrow();
  });
  it('rejects overlapping actual intervals and binds deterministic digest to approved adjustment provenance', () => {
    const input=day([['WORKING',HOUR]]), first=evaluateWorkingTimeAdvisory(input);
    expect(evaluateWorkingTimeAdvisory(structuredClone(input)).snapshotSha256).toBe(first.snapshotSha256);
    input.additionalSources=[source('timesheet_adjustment','approved-correction',2)];
    expect(evaluateWorkingTimeAdvisory(input).snapshotSha256).not.toBe(first.snapshotSha256);
    input.segments.push({...input.segments[0]!,id:'overlap'});
    expect(()=>evaluateWorkingTimeAdvisory(input)).toThrowError(DomainError);
  });
});

class Memory implements Transaction {
  rows=new Map<string,Entity>(); writes=0; events:Data[]=[];
  async get<T extends Data=Data>(kind:string,id:string){const value=this.rows.get(kind+':'+id);assert(value,'NOT_FOUND_SAFE');return structuredClone(value) as Entity<T>;}
  async list<T extends Data=Data>(kind:string){return [...this.rows.values()].filter(value=>value.kind===kind).map(value=>structuredClone(value) as Entity<T>);}
  async add<T extends Data=Data>(kind:string,data:T,id=kind+'-'+this.rows.size){this.writes++;const value={kind,id,companyId:'company',version:1,data:structuredClone(data),createdAt:'2026-10-05T08:00:00Z',updatedAt:'2026-10-05T08:00:00Z'};this.rows.set(kind+':'+id,value);return structuredClone(value);}
  async save(value:Entity,data:Data){this.writes++;const next={...value,data:structuredClone(data),version:value.version+1};this.rows.set(value.kind+':'+value.id,next);return structuredClone(next);}
  async event(type:string,data:Data){this.events.push({type,data});}
}
const actor:Actor={userId:'employee',companyId:'company',roles:['EMPLOYEE'],permissions:['shift.read','timesheet.read'],siteIds:['A'],customerIds:[],warehouseIds:[]};
async function fixture(){
  const tx=new Memory(), input=day([['WORKING',4*HOUR],['ON_BREAK',1800],['WORKING',4*HOUR]]);
  await tx.add('shift',{employeeId:actor.userId,siteId:'A',state:'ENDED',startAt:input.focusStart,endAt:input.focusEnd},'shift');
  for(const segment of input.segments)await tx.add('time_segment',{...segment,employeeId:actor.userId,siteId:segment.activity==='ON_BREAK'?null:'A',reason:'PRIVATE_REASON_CANARY',salaryCents:99999,latitude:52.5},segment.id);
  const ctx:CommandContext={tx,actor,now:input.now,idempotencyKey:'advisory-read',requireOwn:user=>assert(user===actor.userId,'ACCESS_DENIED'),requireSite:site=>assert(actor.siteIds.includes(site),'ACCESS_DENIED')};
  const run=async(name:string,input:Data)=>{const definition=operationsCommands[name]!;return definition.handler(ctx,definition.schema.parse(input));};
  return {tx,input,ctx,run};
}
describe('actual operation advisory command hooks and scoped effective timesheets (CPU, not SQL evidence)',()=>{
  it('reads fresh recorded shift facts without writes, private reasons, pay or GPS payloads',async()=>{
    const f=await fixture(),before=f.tx.writes,result=await f.run('shift.working_time_advisory',{shiftId:'shift'});
    expect(result.dutyDays[0]).toMatchObject({workSeconds:8*HOUR,qualifyingBreakSeconds:1800}); expect(f.tx.writes).toBe(before); expect(f.tx.events).toEqual([]);
    for(const text of ['PRIVATE_REASON_CANARY','salaryCents','latitude','99999'])expect(JSON.stringify(result)).not.toContain(text);
    const segment=await f.tx.get('time_segment','segment-0');await f.tx.save(segment,{...segment.data,activity:'AWAY_PENDING_REASON'});
    expect((await f.run('shift.working_time_advisory',{shiftId:'shift'})).confidence).toBe('INCOMPLETE_OR_PROVISIONAL');
  });
  it('applies approved locked-period corrections once and keeps raw facts, payroll and adjustment provenance intact',async()=>{
    const f=await fixture(),snapshot=f.input.segments.map(segment=>({...segment,employeeId:actor.userId,siteId:segment.activity==='ON_BREAK'?null:'A'}));
    await f.tx.add('timesheet',{employeeId:actor.userId,periodStart:f.input.focusStart,periodEnd:f.input.focusEnd,state:'LOCKED',approvedBy:'accountant',approvedAt:f.input.now,segmentSnapshot:snapshot,payableSeconds:8*HOUR,paidActivities:['WORKING']},'sheet');
    await f.tx.add('timesheet_adjustment',{employeeId:actor.userId,timesheetId:'sheet',state:'APPROVED',sequence:1,proposedSnapshots:[{...snapshot[0],activity:'ON_BREAK',siteId:null}],deltaPayableSeconds:-4*HOUR,approvedBy:'reviewer'},'adjustment');
    const before=f.tx.writes,result=await f.run('timesheet.working_time_advisory',{timesheetId:'sheet'});
    expect(result.dutyDays[0]!.workSeconds).toBe(4*HOUR);expect(result.sources).toContainEqual(source('timesheet_adjustment','adjustment'));
    expect((await f.tx.get('time_segment','segment-0')).data.activity).toBe('WORKING');expect((await f.tx.get('timesheet','sheet')).data.payableSeconds).toBe(8*HOUR);expect(f.tx.writes).toBe(before);
  });
  it('retains new recorded facts missing from an approved snapshot and reports history incomplete',async()=>{
    const f=await fixture();await f.tx.add('timesheet',{employeeId:actor.userId,periodStart:f.input.focusStart,periodEnd:f.input.focusEnd,state:'APPROVED',approvedBy:'reviewer',approvedAt:f.input.now,segmentSnapshot:[]},'sheet');
    const result=await f.run('shift.working_time_advisory',{shiftId:'shift'});expect(result.dutyDays[0]!.workSeconds).toBe(8*HOUR);expect(codes(result)).toContain('HISTORY_SCOPE_OR_RECORDING_INCOMPLETE');expect(result.averagingEvidence).toBe('INSUFFICIENT_HISTORY');
  });
  it('requires own-employee and focus-site scope and grants no manager role bypass',async()=>{
    const f=await fixture(),shift=await f.tx.get('shift','shift');await f.tx.save(shift,{...shift.data,employeeId:'colleague'});
    f.ctx.actor={...actor,roles:['OWNER']};await expect(f.run('shift.working_time_advisory',{shiftId:'shift'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await f.tx.save(await f.tx.get('shift','shift'),{...shift.data,siteId:'foreign-site'});await expect(f.run('shift.working_time_advisory',{shiftId:'shift'})).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('accepts only a current same-company distinct WORKING_TIME approval with exact bounded policy',async()=>{
    const f=await fixture();await f.tx.add('legal_approval',{subject:'WORKING_TIME',status:'APPROVED',active:true,approvedAt:'2026-01-01T00:00:00Z',expiresAt:'2027-01-01T00:00:00Z',evidenceReference:'SYNTHETIC_TEST_ONLY',scope:{workingTimeAdvisory:{travel:'COUNT'}}},'policy');
    expect((await f.run('shift.working_time_advisory',{shiftId:'shift',policyApprovalId:'policy'})).policy.basis).toBe('RECORDED_APPROVED_GENERAL_REGIME_PROFILE');
    const p=await f.tx.get('legal_approval','policy');await f.tx.save(p,{...p.data,subject:'PAYROLL'});await expect(f.run('shift.working_time_advisory',{shiftId:'shift',policyApprovalId:'policy'})).rejects.toMatchObject({code:'NEEDS_APPROVAL'});
    await f.tx.save(await f.tx.get('legal_approval','policy'),{...p.data,expiresAt:f.input.now});await expect(f.run('shift.working_time_advisory',{shiftId:'shift',policyApprovalId:'policy'})).rejects.toMatchObject({code:'NEEDS_APPROVAL'});
  });
});
