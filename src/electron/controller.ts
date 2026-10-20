import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadProject, projectPath, inputSnapshot, atomicJson } from '../core/project';
import { Pipeline, assertProgrammable } from '../core/pipeline';
import { Toolchain, installToolchain, type ToolLock } from '../core/toolchain';
import { Programmer } from '../core/programmer';
import { projectSchema, type AppEvent, type AppState, type RunRecord } from '../shared/types';

export class Controller {
  state: AppState;
  private watchers = new Map<string, FSWatcher>();
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private polling = false;
  private scanTask?: Promise<unknown>;
  constructor(private resources: string, private storage: string, private lock: ToolLock,
    public tools: Toolchain, private send: (event: AppEvent) => void) {
    this.state = { tools: {installed:false,id:tools.id,root:tools.root,message:'Checking tools…'},
      target: {state:'unknown',devices:[],verified:false,message:'USB has not been checked.'},builds:[],busy:true };
  }
  emit() { this.send({type:'state',state:structuredClone(this.state)}); }
  async initialize() { this.state.tools=await this.tools.verify(); this.state.busy=false; this.emit(); if(this.state.tools.installed) await this.scan(); }
  private idle() { if(this.state.busy) throw new Error('Wait for the current operation or cancel it.'); }
  async open(root: string) {
    this.idle();
    const project = await loadProject(root);
    for(const watcher of this.watchers.values()) watcher.close(); this.watchers.clear(); this.state.project=project; this.state.ready=undefined; this.state.activeJob=undefined; this.state.builds=[];
    for(const category of ['builds','simulations','programming']) {
      const base=path.join(root,'.macvivado',category);
      const names=await fs.readdir(base).catch(()=>[]);
      for(const name of names.sort().reverse().slice(0,30)) {
        try {
          const record=JSON.parse(await fs.readFile(path.join(base,name,'run.json'),'utf8')) as RunRecord;
          if(record.status==='running') { record.status='failed'; record.message='Previous run was interrupted.'; }
          // Do not trust paths persisted by a project author.
          record.directory=path.join(base,name);
          if(record.action==='build' && record.bitstream) record.bitstream=path.join(record.directory,'design.bit');
          this.state.builds.push(record);
        } catch {}
      }
    }
    this.state.builds.sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
    const latest=this.state.builds.find(r=>r.action==='build');
    try { await assertProgrammable(root,latest,this.tools); this.state.ready=latest; } catch {}
    this.updateWatchers();
    this.emit(); return project;
  }
  async refresh() {
    if(!this.state.project) return;
    try { this.state.project=await loadProject(this.state.project.root); this.updateWatchers(); }
    catch { this.state.ready=undefined; }
    this.emit();
  }
  private updateWatchers() {
    const project=this.state.project; if(!project)return;
    // Watch input directories only. Recursive root watches also consume a descriptor for every retained artifact.
    const directories=new Set(['',...project.files.flatMap(f=>f.split('/').slice(0,-1).map((_,i)=>f.split('/').slice(0,i+1).join('/')))]);
    for(const [directory,watcher] of this.watchers) if(!directories.has(directory)){watcher.close();this.watchers.delete(directory);}
    for(const directory of directories) {
      if(this.watchers.has(directory))continue;
      try {
        const watcher=watch(path.join(project.root,directory),(_type,filename)=>{
          if(!filename || filename.startsWith('.'))return;
          this.state.ready=undefined;this.emit();clearTimeout(this.refreshTimer);
          this.refreshTimer=setTimeout(()=>void this.refresh(),200);
        });
        watcher.on('error',()=>{watcher.close();this.watchers.delete(directory);this.state.ready=undefined;this.emit();});
        this.watchers.set(directory,watcher);
      } catch { this.state.ready=undefined; }
    }
  }
  private project() { if(!this.state.project) throw new Error('Open a project first.'); return this.state.project; }
  async read(file: string) {
    const filename=await projectPath(this.project().root,file);
    if((await fs.stat(filename)).size>2*1024*1024) throw new Error('Editor limit is 2 MiB per file.');
    return fs.readFile(filename,'utf8');
  }
  async write(file: string, text: string) {
    if(Buffer.byteLength(text)>2*1024*1024) throw new Error('Editor limit is 2 MiB per file.');
    if(file==='macvivado.json') projectSchema.parse(JSON.parse(text));
    const target=await projectPath(this.project().root,file);
    await fs.writeFile(target,text); this.state.ready=undefined; await this.refresh();
  }
  async createFile(file: string) {
    const target=await projectPath(this.project().root,file,false);
    await fs.writeFile(target,'',{flag:'wx'}); this.state.ready=undefined; await this.refresh();
  }
  async run(action: 'build'|'simulate') {
    this.idle(); const root=this.project().root;
    if(action==='build') this.state.ready=undefined;
    this.state.busy=true; this.abort=new AbortController(); this.emit();
    let jobId='';
    try {
      const pipeline=new Pipeline(this.tools,(stream,text)=>this.send({type:'log',jobId,stream,text}));
      const record=await pipeline.run(root,action,this.abort.signal,record=>{ jobId=record.id; this.state.activeJob=record; this.emit(); });
      this.state.builds.unshift(record); this.state.builds=this.state.builds.slice(0,60);
      if(action==='build' && record.status==='success') this.state.ready=record;
    } finally { this.state.busy=false; this.abort=undefined; this.emit(); }
  }
  async install() {
    this.idle(); this.state.busy=true; this.abort=new AbortController(); this.state.ready=undefined;
    const record: RunRecord={id:randomUUID(),action:'install',status:'running',startedAt:new Date().toISOString(),directory:this.storage,fingerprint:'',toolchain:this.tools.id,diagnostics:[],stages:['Install native tools']};
    this.state.activeJob=record; this.emit();
    try {
      this.tools=await installToolchain(this.storage,this.resources,this.lock,(stream,text)=>this.send({type:'log',jobId:record.id,stream,text}),this.abort.signal);
      this.state.tools=await this.tools.verify(); record.status='success'; record.message='Native tools installed and verified.';
    } catch(e) { record.status=this.abort.signal.aborted?'canceled':'failed'; record.message=(e as Error).message; record.diagnostics=[{severity:'error',message:record.message}]; }
    finally { record.finishedAt=new Date().toISOString(); this.state.activeJob={...record}; this.state.busy=false; this.abort=undefined; this.emit(); }
    if(this.state.tools.installed) await this.scan();
  }
  cancel() { this.abort?.abort(); }
  async scan(serial=this.state.target.selected) {
    if(this.state.busy || this.polling) return;
    this.polling=true;
    try {
      if(!this.state.tools.installed) { this.state.target={state:'unknown',devices:[],verified:false,message:'Install tools to check USB devices.'}; return; }
      const task=new Programmer(this.tools).scan(serial);this.scanTask=task;
      this.state.target=await task;
    } finally { this.scanTask=undefined;this.polling=false; this.emit(); }
  }
  async selectDevice(serial: string) { this.idle(); if(!this.state.target.devices.some(d=>d.serial===serial)) throw new Error('Device is no longer available. Refresh USB.'); this.state.target.selected=serial; await this.scan(serial); }
  async program() {
    this.idle(); const root=this.project().root, ready=this.state.ready, serial=this.state.target.selected;
    if(!serial || !this.state.target.verified) throw new Error('Connect and select a verified Nexys A7-100T first.');
    this.state.busy=true; this.abort=new AbortController();
    const id=`${Date.now()}-${randomUUID().slice(0,8)}`, directory=path.join(root,'.macvivado','programming',id);
    const record: RunRecord={id,action:'program',status:'running',startedAt:new Date().toISOString(),directory,fingerprint:ready!.fingerprint,toolchain:this.tools.id,diagnostics:[],stages:['Check target','Program volatile SRAM']};
    this.state.activeJob=record; this.emit();
    let pendingLog=Promise.resolve();
    try {
      await fs.mkdir(directory,{recursive:true});
      await this.scanTask;
      const bitstream=await assertProgrammable(root,ready,this.tools);
      // Program an immutable copy, after checking it against the fingerprinted build.
      const copy=path.join(directory,'design.bit'); await fs.copyFile(bitstream,copy);
      const {fileSha256}=await import('../core/project');
      this.state.target=await new Programmer(this.tools).program(serial,copy,this.abort.signal,(stream,text)=> {
        this.send({type:'log',jobId:id,stream,text}); pendingLog=pendingLog.then(()=>fs.appendFile(path.join(directory,'run.log'),text));
      },async()=>{ await assertProgrammable(root,ready,this.tools); if(await fileSha256(copy)!==ready!.bitstreamSha256) throw new Error('Programming copy checksum mismatch.'); });
      record.status='success'; record.message='openFPGALoader completed volatile programming. Observe the board and record physical behavior separately.';
    } catch(e) { record.status=this.abort.signal.aborted?'canceled':'failed'; record.message=(e as Error).message; record.diagnostics=[{severity:'error',message:record.message}]; this.state.target={state:'unknown',devices:[],verified:false,message:'Refresh USB after the interrupted programming operation.'}; }
    finally {
      record.finishedAt=new Date().toISOString();
      try { await pendingLog; await atomicJson(path.join(directory,'run.json'),record); }
      catch(e) { record.status='failed';record.message=`Could not retain programming artifacts: ${(e as Error).message}`; }
      finally {this.state.activeJob=record; this.state.builds.unshift(record); this.state.busy=false; this.abort=undefined; this.emit();}
    }
  }
  close() { this.abort?.abort(); for(const watcher of this.watchers.values())watcher.close(); this.watchers.clear(); clearTimeout(this.refreshTimer); }
}
