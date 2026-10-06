import {describe,it,expect} from 'vitest';
import {EventEmitter} from 'node:events';
import {clamAvVerdict,pdfSignature,scanPdf} from '../packages/integrations/media-scanner.ts';
class Scanner extends EventEmitter {writes:Buffer[]=[];destroyed=false;write(bytes:Buffer){this.writes.push(bytes);return true;}end(){}destroy(){this.destroyed=true;}}
const pdf=Buffer.from('%PDF-1.7\nSynthetic test PDF\n%%EOF\n');
describe('private PDF quarantine scanner contract',()=>{
 it('accepts only exact successful scanner verdict',()=>{expect(clamAvVerdict('stream: OK\0').state).toBe('CLEAN');for(const answer of ['OK','stream: ERROR','stream: Size limit exceeded ERROR',''])expect(()=>clamAvVerdict(answer)).toThrow('PROVIDER_UNAVAILABLE');});
 it('infected PDF is rejected instead of registered CLEAN',()=>{expect(()=>clamAvVerdict('stream: Eicar-Signature FOUND\0')).toThrow('VALIDATION_ERROR');});
 it('unconfigured scanner keeps PDF upload closed',async()=>{await expect(scanPdf(pdf,{})).rejects.toMatchObject({code:'MISSING_CONFIGURATION',details:{reason:'PDF_MALWARE_SCANNER_REQUIRED'}});});
 it('PDF MIME signature must have header and trailing EOF',()=>{expect(()=>pdfSignature(Buffer.from('not PDF'))).toThrow();expect(()=>pdfSignature(Buffer.from('%PDF-1.7 missing end'))).toThrow();expect(()=>pdfSignature(pdf)).not.toThrow();});
 it('sends bounded INSTREAM bytes and requires actual provider verdict',async()=>{const socket=new Scanner(),result=scanPdf(pdf,{MEDIA_SCANNER_URL:'tcp://clamav.internal:3310'},()=>socket);socket.emit('connect');expect(socket.writes[0]!.toString()).toBe('zINSTREAM\0');expect(socket.writes[1]!.readUInt32BE()).toBe(pdf.length);expect(socket.writes[2]).toEqual(pdf);expect(socket.writes[3]!.readUInt32BE()).toBe(0);socket.emit('data',Buffer.from('stream: OK\0'));expect(await result).toMatchObject({state:'CLEAN',method:'CLAMAV_INSTREAM'});expect(socket.destroyed).toBe(true);});
 it('provider disconnect/error never claims clean',async()=>{const socket=new Scanner(),result=scanPdf(pdf,{MEDIA_SCANNER_URL:'tcp://clamav.internal:3310'},()=>socket);socket.emit('error',new Error('Offline'));await expect(result).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});});
});
