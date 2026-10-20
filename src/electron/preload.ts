import { contextBridge, ipcRenderer } from 'electron';
import type { API, AppEvent, Result } from '../shared/types';
import type { Request } from '../shared/ipc';
async function invoke<T>(request: Request): Promise<T> {
  const response=await ipcRenderer.invoke('macvivado:request',request) as Result<T>;
  if(!response.ok) throw new Error(response.error); return response.value;
}
const api: API={
  state:()=>invoke({method:'state'}),openProject:()=>invoke({method:'openProject'}),
  createExample:example=>invoke({method:'createExample',example:example as 'blink'|'switch-to-led'|'seven-segment'}),
  readFile:path=>invoke({method:'readFile',path}), writeFile:(path,content)=>invoke({method:'writeFile',path,content}),
  createFile:path=>invoke({method:'createFile',path}),run:action=>invoke({method:'run',action}),
  cancel:()=>invoke({method:'cancel'}),installTools:()=>invoke({method:'installTools'}),
  scanDevices:()=>invoke({method:'scanDevices'}),selectDevice:serial=>invoke({method:'selectDevice',serial}),
  program:()=>invoke({method:'program'}),revealArtifacts:id=>invoke({method:'revealArtifacts',id}),
  readRun:id=>invoke({method:'readRun',id}),
  onEvent(listener) { const handler=(_event: Electron.IpcRendererEvent,event: AppEvent)=>listener(event); ipcRenderer.on('macvivado:event',handler); return ()=>ipcRenderer.removeListener('macvivado:event',handler); }
};
contextBridge.exposeInMainWorld('macvivado',Object.freeze(api));
