import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// The repository's Node-only suite deliberately leaves Solid JSX untransformed.
// Execute the actual lifecycle helper from its AST; render/focus QA stays a browser gate.
const source=ts.createSourceFile('KnabaAssistant.tsx',readFileSync(new URL('../src/components/KnabaAssistant.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const helper=source.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='assistantDialogControls');
if(!helper)throw new Error('Assistant dialog lifecycle helper is missing');
const output=ts.transpileModule(helper.getText(source),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={} as {assistantDialogControls:typeof import('../src/components/KnabaAssistant').assistantDialogControls};
runInNewContext(output,{exports,queueMicrotask});
const {assistantDialogControls}=exports;

function fixture(initiallyOpen=true){
  let open=initiallyOpen;
  const panel={isConnected:true,focus:vi.fn()} as unknown as HTMLElement;
  let launcher={isConnected:true,focus:vi.fn()} as unknown as HTMLButtonElement;
  const stopSpeech=vi.fn();
  const close=vi.fn(()=>{open=false;});
  const controls=assistantDialogControls({isOpen:()=>open,panel:()=>panel,launcher:()=>launcher,close,stopSpeech});
  return {controls,panel,stopSpeech,close,get launcher(){return launcher;},setLauncher:(next:HTMLButtonElement)=>{launcher=next;},setOpen:(next:boolean)=>{open=next;}};
}
const key=(name:string,props:Partial<KeyboardEvent>={})=>({key:name,isComposing:false,defaultPrevented:false,preventDefault:vi.fn(),stopPropagation:vi.fn(),...props}) as unknown as KeyboardEvent;

describe('nonmodal assistant keyboard lifecycle',()=>{
  it('focuses the panel after initial lazy mount without focusing a text input',async()=>{
    const view=fixture();
    view.controls.focusOnOpen();
    expect(view.panel.focus).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(view.panel.focus).toHaveBeenCalledWith({preventScroll:true});
  });
  it('Escape stops speech and returns focus to the current replacement launcher',async()=>{
    const view=fixture();
    const original=view.launcher,event=key('Escape');
    view.controls.keydown(event);
    expect(view.stopSpeech).toHaveBeenCalledOnce();
    expect(view.close).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    const replacement={isConnected:true,focus:vi.fn()} as unknown as HTMLButtonElement;
    view.setLauncher(replacement);
    await Promise.resolve();
    expect(original.focus).not.toHaveBeenCalled();
    expect(replacement.focus).toHaveBeenCalledWith({preventScroll:true});
  });
  it('uses the same cleanup and focus lifecycle for the close button',async()=>{
    const view=fixture();
    view.controls.close();
    await Promise.resolve();
    expect(view.stopSpeech).toHaveBeenCalledOnce();
    expect(view.launcher.focus).toHaveBeenCalledOnce();
  });
  it('does not trap Tab or consume Escape belonging to IME or another control',()=>{
    const view=fixture();
    for(const event of [key('Tab'),key('Enter'),key('Escape',{isComposing:true}),key('Escape',{defaultPrevented:true})]){
      view.controls.keydown(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(view.close).not.toHaveBeenCalled();
    expect(view.stopSpeech).not.toHaveBeenCalled();
  });
  it('does not move focus to a removed control or after the panel has reopened',async()=>{
    const view=fixture();
    view.controls.close();view.setOpen(true);
    await Promise.resolve();
    expect(view.launcher.focus).not.toHaveBeenCalled();
    const disconnected={isConnected:false,focus:vi.fn()} as unknown as HTMLButtonElement;
    view.setLauncher(disconnected);view.controls.close();
    await Promise.resolve();
    expect(disconnected.focus).not.toHaveBeenCalled();
  });
  it('does not steal focus when an opening is dismissed before the mount settles',async()=>{
    const view=fixture();
    view.controls.focusOnOpen();view.setOpen(false);
    await Promise.resolve();
    expect(view.panel.focus).not.toHaveBeenCalled();
  });
});
