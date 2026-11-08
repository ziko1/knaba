export type RuntimeMode='DEMO'|'TEST'|'PRODUCTION';
export function requireCompanyId(mode:RuntimeMode,value:unknown):string;
export function resolveCompanyId(mode:RuntimeMode,value:unknown):string;
export function parsePublicOrigin(mode:RuntimeMode,value:unknown,required?:boolean):Readonly<{raw:string;origin:string}>|undefined;
export function requireReleaseSha(value:unknown):string;
export function resolveBuildSha(mode:RuntimeMode,environmentSha:unknown,compiledSha:unknown):string;
