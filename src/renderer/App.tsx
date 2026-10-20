/* THESIS: A local FPGA lab workbench where code, real tool output, and target state stay visible.
   OWN-WORLD: VS Code conventions selected by the user; graphite panes, system text, blue focus.
   STORY: Open ordinary HDL, simulate, inspect signals, build a current bitstream, then check a target.
   FIRST VIEWPORT: Project tree left, tabbed Monaco editor center, resizable output below, run actions above.
   FORM: Familiar IDE canon, explicitly selected by the user; no generated device states. */
import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { AppState, Diagnostic, RunRecord, Waveform as WaveData } from '../shared/types';
import board from '../../resources/boards/nexys-a7-100t.json';
import { Waveform } from './Waveform';

type Tab={path:string;content:string;saved:string};
type Panel='output'|'problems'|'waveform';
const api=window.macvivado;
const filename=(p:string)=>p.split('/').at(-1)!;
const language=(p:string)=>/\.json$/.test(p)?'json':/\.xdc$/.test(p)?'tcl':/\.(svh?|vh?)$/.test(p)?'verilog':'plaintext';
const exampleList=[['blink','LED blink','A 100 MHz clock and a half-second toggle.'],['switch-to-led','Switch to LED','All 16 switches, with the correct bank voltages.'],['seven-segment','Button counter','Debounce, decimal counting, and an active-low display.']];
function Icon({name}:{name:'play'|'build'|'chip'|'folder'|'file'|'wave'|'tools'}) {
  const paths={play:'M6 3l10 7-10 7z',build:'M3 17l8-8M9 3l8 8M12 2l6 6M3 13l4 4',chip:'M5 5h10v10H5zM2 7h3M2 12h3M15 7h3M15 12h3M7 2v3M12 2v3M7 15v3M12 15v3',folder:'M2 5h6l2 2h8v10H2z',file:'M5 2h7l4 4v12H5zM12 2v5h4',wave:'M1 14h4V5h5v9h5V5h4',tools:'M4 16l7-7M12 2a5 5 0 006 6l-4 4-5-5zM2 17l2 2 3-3-2-2z'};
  return <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
function Tree({files,active,onOpen}:{files:string[];active?:string;onOpen:(f:string)=>void}) {
  const [collapsed,setCollapsed]=useState<string[]>([]);
  const dirs=[...new Set(files.flatMap(f=>f.split('/').slice(0,-1).map((_,i)=>f.split('/').slice(0,i+1).join('/'))))];
  const rows=[...dirs.map(p=>({path:p,dir:true})),...files.map(p=>({path:p,dir:false}))].sort((a,b)=>a.path.localeCompare(b.path));
  return <div className="file-tree" role="tree" aria-label="Project files">{rows.filter(row=>!collapsed.some(dir=>row.path.startsWith(dir+'/'))).map(row=><button key={row.path} role="treeitem" aria-expanded={row.dir?!collapsed.includes(row.path):undefined} aria-selected={!row.dir&&active===row.path} className={`${row.dir?'directory':'file'} ${active===row.path?'selected':''}`} style={{paddingLeft:14+row.path.split('/').length*12}} title={row.path}
    onClick={()=>row.dir?setCollapsed(c=>c.includes(row.path)?c.filter(p=>p!==row.path):[...c,row.path]):onOpen(row.path)}><span className="tree-chevron">{row.dir?(collapsed.includes(row.path)?'›':'⌄'):''}</span><Icon name={row.dir?'folder':'file'}/><span>{filename(row.path)}</span></button>)}</div>;
}
export function App() {
  const [state,setState]=useState<AppState>(),[tabs,setTabs]=useState<Tab[]>([]),[active,setActive]=useState<string>(),[panel,setPanel]=useState<Panel>('output');
  const [logs,setLogs]=useState<Record<string,string>>({}),[selectedRun,setSelectedRun]=useState<RunRecord>(),[wave,setWave]=useState<WaveData>(),[waveKey,setWaveKey]=useState('');
  const [error,setError]=useState(''),[sidebar,setSidebar]=useState(true),[settings,setSettings]=useState(false),[boardFilter,setBoardFilter]=useState(''),[newFile,setNewFile]=useState<string|undefined>(),[closing,setClosing]=useState<Tab>();
  const [height,setHeight]=useState(300),[theme,setTheme]=useState(localStorage.getItem('theme')??'dark'),[position,setPosition]=useState({line:1,column:1});
  const editorRef=useRef<editor.IStandaloneCodeEditor|null>(null),logRef=useRef<HTMLPreElement>(null),tabsRef=useRef(tabs),activeRef=useRef(active),lastRun=useRef(''),completedRun=useRef('');
  tabsRef.current=tabs; activeRef.current=active;
  const dirty=tabs.some(t=>t.content!==t.saved), current=tabs.find(t=>t.path===active);
  const guard=useCallback(async(fn:()=>Promise<unknown>)=>{try{await fn();}catch(e){setError((e as Error).message);}},[]);
  const openFile=useCallback(async(file:string,line?:number,column=1)=> {
    const existing=tabsRef.current.find(t=>t.path===file);
    if(!existing) { const content=await api.readFile(file); setTabs(t=>t.some(x=>x.path===file)?t:[...t,{path:file,content,saved:content}]); }
    setActive(file);
    if(line) setTimeout(()=>{editorRef.current?.revealLineInCenter(line);editorRef.current?.setPosition({lineNumber:line,column});editorRef.current?.focus();},120);
  },[]);
  const save=useCallback(async(all=false)=> {
    for(const tab of tabsRef.current.filter(t=>(all||t.path===activeRef.current)&&t.content!==t.saved)) {
      await api.writeFile(tab.path,tab.content);
      setTabs(t=>t.map(current=>current.path===tab.path?{...current,saved:tab.content}:current));
    }
  },[]);
  const removeTab=useCallback((file:string)=>{
    const remaining=tabsRef.current.filter(t=>t.path!==file);setTabs(remaining);
    if(activeRef.current===file)setActive(remaining.at(-1)?.path);
  },[]);
  const closeTab=useCallback(()=>{
    const tab=tabsRef.current.find(t=>t.path===activeRef.current);if(!tab)return;
    if(tab.content!==tab.saved)setClosing(tab);else removeTab(tab.path);
  },[removeTab]);
  const openProject=useCallback(async()=>{
    await save(true);await api.openProject();
  },[save]);
  const execute=useCallback(async(action:'simulate'|'build')=>{setError('');await save(true);setPanel('output');await api.run(action);},[save]);
  const commands=useRef<Record<string,()=>void>>({});
  commands.current={open:()=>void guard(openProject),save:()=>void guard(()=>save()),saveAll:()=>void guard(()=>save(true)),closeTab,
    simulate:()=>void guard(()=>execute('simulate')),build:()=>void guard(()=>execute('build')),program:()=>void guard(()=>api.program()),toggleSidebar:()=>setSidebar(s=>!s)};
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{
      const modified=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();
      const command=modified&&key==='s'?(event.altKey?'saveAll':'save'):
        modified&&key==='b'?(event.shiftKey?'build':'toggleSidebar'):
        modified&&key==='o'?'open':modified&&key==='w'?'closeTab':
        modified&&event.altKey&&key==='p'?'program':key==='f5'&&!event.shiftKey?'simulate':undefined;
      if(command){event.preventDefault();event.stopPropagation();commands.current[command]?.();}
      if(key==='escape'){setClosing(undefined);setNewFile(undefined);}
    };
    window.addEventListener('keydown',keydown,true);return()=>window.removeEventListener('keydown',keydown,true);
  },[]);
  useEffect(()=>{
    const accept=(next:AppState)=>{
      setState(next);
      const run=next.activeJob;
      if(run){
        if(lastRun.current!==run.id){lastRun.current=run.id;setSelectedRun(run);setPanel('output');}
        else setSelectedRun(current=>current?.id===run.id?run:current);
        if(run.status!=='running'&&completedRun.current!==run.id){completedRun.current=run.id;
          if(run.waveform){setWave(run.waveform);setWaveKey(run.id);setPanel('waveform');}
          else if(run.status==='failed')setPanel('problems');
        }
      }
    };
    void api.state().then(accept).catch(e=>setError(e.message));
    return api.onEvent(event=>{
      if(event.type==='state')accept(event.state);
      else if(event.type==='command')commands.current[event.command]?.();
      else setLogs(current=>({...current,[event.jobId]:((current[event.jobId]??'')+event.text).slice(-1024*1024)}));
    });
  },[guard,openFile]);
  const projectRoot=state?.project?.root;
  useEffect(()=>{
    tabsRef.current=[];activeRef.current=undefined;
    setTabs([]);setActive(undefined);setWave(undefined);setSelectedRun(undefined);
    lastRun.current='';completedRun.current='';
    if(projectRoot && state?.project)void guard(()=>openFile(state.project!.config.sources[0]));
  },[projectRoot,guard,openFile]);
  useEffect(()=>{const unload=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload);},[dirty]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('theme',theme);},[theme]);
  useEffect(()=>{if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;},[logs,selectedRun?.id,panel]);
  const diagnostics=selectedRun?.diagnostics ?? state?.activeJob?.diagnostics ?? [];
  useEffect(()=>{
    const monacoEditor=editorRef.current;
    if(!monacoEditor?.getModel())return;
    // Runtime import stays local; no CDN language services.
    void import('monaco-editor').then(monaco=>{
      if(!monacoEditor.getModel())return;
      monaco.editor.setModelMarkers(monacoEditor.getModel()!,'macvivado',diagnostics.filter(d=>d.file===active).map(d=>({startLineNumber:d.line??1,endLineNumber:d.line??1,startColumn:d.column??1,endColumn:(d.column??1)+1,message:d.message,severity:d.severity==='error'?monaco.MarkerSeverity.Error:monaco.MarkerSeverity.Warning})));
    });
  },[diagnostics,active]);
  const ready=state?.ready;
  const programReason=state?.busy?'Wait for the current operation.':dirty?'Build your unsaved changes first.':!ready?'Build the current project first.':!state?.target.verified?'Connect and select a verified Nexys A7-100T.':'Program volatile SRAM; contents are lost at power off.';
  const navigate=(d:Diagnostic)=>{if(d.file)void guard(()=>openFile(d.file!,d.line,d.column));};
  async function selectHistory(record:RunRecord) { const detail=await api.readRun(record.id);setSelectedRun(detail.record);setLogs(l=>({...l,[record.id]:detail.log}));if(detail.record.waveform){setWave(detail.record.waveform);setWaveKey(record.id);}setPanel('output'); }
  const errors=diagnostics.filter(d=>d.severity==='error').length,warnings=diagnostics.filter(d=>d.severity==='warning').length;
  return <div className="app-shell">
    <header className="titlebar"><span className="title-brand">MacVivado</span><span className="title-project">{state?.project?.config.name??'FPGA workbench'}</span><span className="title-platform">Apple Silicon</span></header>
    <div className="toolbar"><div className="toolbar-left"><button title="Open project · ⌘O" onClick={()=>void guard(openProject)}><Icon name="folder"/>Open</button><button title="Save all · ⌥⌘S" disabled={!dirty} onClick={()=>void guard(()=>save(true))}>Save all{dirty&&<span className="dirty-indicator"/>}</button><span className="toolbar-divider"/><span className="board-caption">Nexys A7-100T <span className="muted">/ 100 MHz</span></span></div>
      <div className="run-actions"><button disabled={!state?.project||state.busy||!state.tools.installed} title="Simulate testbench · F5" onClick={()=>void guard(()=>execute('simulate'))}><Icon name="play"/>Simulate</button><button className="build-action" disabled={!state?.project||state.busy||!state.tools.installed} title="Build bitstream · ⇧⌘B" onClick={()=>void guard(()=>execute('build'))}><Icon name="build"/>Build</button><button disabled={!ready||dirty||!state?.target.verified||state.busy} title={programReason} onClick={()=>void guard(()=>api.program())}><Icon name="chip"/>Program</button><button className={settings?'active':''} aria-label="Toolchain and board settings" aria-pressed={settings} title="Toolchain and board settings" onClick={()=>setSettings(!settings)}><Icon name="tools"/></button></div></div>
    {error&&<div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError('')}>×</button></div>}
    <div className={`workbench ${sidebar?'':'sidebar-hidden'}`}>
      {sidebar&&<aside className="navigator"><div className="pane-heading"><span>Explorer</span><button aria-label="New file" disabled={!state?.project} title="New file" onClick={()=>setNewFile('rtl/new.v')}>＋</button></div>
        {state?.project?<><div className="project-heading" title={state.project.root}>⌄ <strong>{state.project.config.name}</strong></div><Tree key={state.project.root} files={state.project.files} active={active} onOpen={file=>void guard(()=>openFile(file))}/><button className="project-config" onClick={()=>void guard(()=>openFile('macvivado.json'))}>⚙ Project configuration</button></>:<div className="navigator-empty">Open a project folder or create an example to begin.</div>}
        <div className="history-section"><div className="pane-heading">Run history <span className="muted">{state?.builds.length??0}</span></div>{!state?.builds.length?<p className="navigator-empty">Builds and simulations will appear here.</p>:state.builds.slice(0,12).map(r=><button className={`history-row ${selectedRun?.id===r.id?'selected':''}`} key={r.id} title={`${r.status}: ${r.message??''}`} onClick={()=>void guard(()=>selectHistory(r))}><span className={`state-symbol ${r.status}`}>{r.status==='success'?'✓':r.status==='running'?'◌':r.status==='stale'?'↻':'×'}</span><span>{r.action==='build'?'Bitstream':r.action==='simulate'?'Simulation':r.action==='program'?'Programming':'Tools'}<small>{new Date(r.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · {r.status}</small></span></button>)}</div>
        <div className="navigator-target"><div className="target-title"><Icon name="chip"/><strong>Hardware target</strong><button title="Refresh USB" aria-label="Refresh USB" disabled={state?.busy||!state?.tools.installed} onClick={()=>void guard(()=>api.scanDevices())}>↻</button></div><span className={`target-status ${state?.target.verified?'success':''}`}>{state?.target.verified?'Connected & identified':state?.target.state==='disconnected'?'No board connected':state?.target.state==='error'?'Detection error':'Not checked'}</span>
          {!!state?.target.devices.length&&<select aria-label="USB device" value={state.target.selected??''} onChange={e=>void guard(()=>api.selectDevice(e.target.value))}><option value="" disabled>Select USB serial</option>{state.target.devices.map(d=><option key={d.serial} value={d.serial}>{d.serial} · {d.description}</option>)}</select>}
          <p>{state?.target.message??'Native tool installation is checked at launch.'}</p><span className="verification-label">Physical verification pending</span></div>
      </aside>}
      <main className="workspace" style={{gridTemplateRows:`minmax(150px,1fr) 5px ${height}px`}}>
        <section className="editor-section" aria-label="Editor"><div className="editor-tabs" role="tablist" aria-label="Open files">{tabs.map(tab=><div className={`editor-tab ${tab.path===active?'active':''}`} key={tab.path}><button role="tab" aria-selected={tab.path===active} tabIndex={tab.path===active?0:-1} onClick={()=>setActive(tab.path)} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const index=tabs.findIndex(t=>t.path===tab.path);setActive(tabs[(index+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length].path);}}}><span className="file-type">{language(tab.path)==='verilog'?'V':language(tab.path)==='tcl'?'X':'{ }'}</span>{filename(tab.path)}{tab.content!==tab.saved&&<span className="dirty-indicator" aria-label="Unsaved"/>}</button><button className="tab-close" aria-label={`Close ${filename(tab.path)}`} onClick={()=>tab.content!==tab.saved?setClosing(tab):removeTab(tab.path)}>×</button></div>)}{!tabs.length&&<span className="empty-tabs">Workbench</span>}</div>
          {current?<><div className="breadcrumbs">{state?.project?.config.name} <span>›</span> {current.path.replaceAll('/',' › ')}<span className="editor-encoding">UTF-8</span></div><div className="monaco-host"><Editor path={`${state?.project?.root}/${current.path}`} language={language(current.path)} value={current.content} theme={theme==='dark'?'vs-dark':'vs'} onChange={value=>{const next=tabsRef.current.map(tab=>tab.path===activeRef.current?{...tab,content:value??''}:tab);tabsRef.current=next;setTabs(next);}} onMount={(instance,monaco)=>{editorRef.current=instance;instance.onDidChangeCursorPosition(e=>setPosition({line:e.position.lineNumber,column:e.position.column}));instance.addCommand(monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyS,()=>void guard(()=>save()));}} options={{fontFamily:'SFMono-Regular, Menlo, monospace',fontSize:13,lineHeight:21,minimap:{enabled:false},scrollBeyondLastLine:false,automaticLayout:true,tabSize:4,insertSpaces:true,padding:{top:12},renderLineHighlight:'line',wordWrap:'off',smoothScrolling:false,accessibilitySupport:'on'}} loading={<div className="empty-panel">Loading local editor…</div>}/></div></>:<div className="welcome"><div className="welcome-mark"><Icon name="chip"/></div><h1>MacVivado</h1><p className="welcome-description">Your digital logic lab, on your Mac.</p><div className="welcome-start"><button className="primary" onClick={()=>void guard(openProject)}><Icon name="folder"/>Open project folder <kbd>⌘O</kbd></button><p>Verilog · Nexys A7-100T · native ARM64 tools</p></div><h2>Start from an example</h2><div className="example-list">{exampleList.map(([id,title,description])=><button key={id} onClick={()=>void guard(async()=>{await save(true);await api.createExample(id);})}><Icon name={id==='blink'?'wave':id==='switch-to-led'?'file':'chip'}/><span><strong>{title}</strong><small>{description}</small></span><span className="example-arrow">↗</span></button>)}</div><div className="welcome-note"><strong>Work without a board</strong><p>Edit, simulate, inspect waveforms, and build bitstreams. Connect a board when you are ready to test physical behavior.</p></div>{!state?.tools.installed&&<button className="install-inline" disabled={state?.busy} onClick={()=>void guard(()=>api.installTools())}>Install verified native tools <span>Yosys · Icarus · openXC7 · openFPGALoader</span></button>}</div>}
        </section>
        <div className="panel-resizer" role="separator" aria-label="Resize output panel" aria-orientation="horizontal" tabIndex={0} aria-valuemin={160} aria-valuemax={600} aria-valuenow={height} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(h=>Math.max(160,Math.min(600,h+(e.key==='ArrowUp'?20:-20))));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);const startY=e.clientY,original=height;const el=e.currentTarget;const move=(event:PointerEvent)=>setHeight(Math.max(160,Math.min(window.innerHeight-260,original+startY-event.clientY)));const stop=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',stop);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',stop);}}/>
        <section className="output-section" aria-label="Run results"><div className="panel-toolbar"><div role="tablist" aria-label="Results view">{(['problems','output','waveform'] as Panel[]).map(p=><button role="tab" aria-selected={panel===p} className={panel===p?'active':''} key={p} onClick={()=>setPanel(p)}>{p==='problems'?<>Problems <span className="count">{diagnostics.length}</span></>:p==='output'?'Output':'Waveforms'}</button>)}</div><div className="run-info">{state?.busy?<><span className="running-dot"/>{state.activeJob?.stages.at(-1)??'Running…'}<button className="cancel" onClick={()=>void guard(()=>api.cancel())}>■ Cancel</button></>:selectedRun?<><span className={`state-symbol ${selectedRun.status}`}>{selectedRun.status==='success'?'✓':'×'}</span><span>{selectedRun.action} · {selectedRun.status}</span>{selectedRun.action!=='install'&&<button title="Show artifacts in Finder" onClick={()=>void guard(()=>api.revealArtifacts(selectedRun.id))}>Artifacts ↗</button>}</>:<span className="muted">No run selected</span>}</div></div>
          {selectedRun?.message&&<div className={`run-summary ${selectedRun.status}`}>{selectedRun.message}</div>}
          <div className="panel-content">{panel==='output'?<pre className="output-log" ref={logRef} tabIndex={0} aria-label="Tool output">{selectedRun?logs[selectedRun.id]??'Select a run in history to load its saved output.':'Real compiler and programmer output appears here when you run an action.'}</pre>:panel==='problems'?<div className="problems-list">{diagnostics.length?diagnostics.map((d,i)=><button key={i} className="diagnostic" disabled={!d.file} onClick={()=>navigate(d)}><span className={d.severity==='error'?'error-text':'warning-text'}>{d.severity==='error'?'⊗':'△'}</span><span>{d.message}</span><small>{d.file?`${d.file}:${d.line??1}`:d.severity}</small></button>):<div className="empty-panel"><strong>No reported problems</strong><span>Compiler diagnostics appear after a simulation or build.</span></div>}</div>:<Waveform key={waveKey} wave={wave}/>}</div>
        </section>
      </main>
      {settings&&<aside className="settings-pane"><div className="pane-heading">Toolchain & board<button aria-label="Close settings" onClick={()=>setSettings(false)}>×</button></div><div className="settings-content"><h2>Native toolchain</h2><p className={state?.tools.installed?'success-text':''}>{state?.tools.installed?'✓ Checksums verified':state?.tools.message??'Checking…'}</p><code>{state?.tools.id}</code><p>Tools are pinned together and installed in app-managed storage. The installer verifies both archives before use.</p><button disabled={state?.busy} onClick={()=>void guard(()=>api.installTools())}>{state?.tools.installed?'Repair tools':'Install tools'}</button><h2>Project</h2><p>Target: <code>xc7a100tcsg324-1</code><br/>Programming: volatile SRAM only.</p><button disabled={!state?.project} onClick={()=>void guard(()=>openFile('macvivado.json'))}>Edit macvivado.json</button><label className="theme-select">Appearance<select value={theme} onChange={e=>setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label><h2>Digilent pin reference</h2><p>Voltage standards come from the official Nexys A7-100T master XDC.</p><input aria-label="Filter board pins" placeholder="Filter ports or pins…" value={boardFilter} onChange={e=>setBoardFilter(e.target.value)}/><table className="pin-table"><thead><tr><th>Port</th><th>Pin</th><th>Standard</th></tr></thead><tbody>{Object.entries(board.pins).filter(([name,pin])=>(name+' '+pin.pin).toLowerCase().includes(boardFilter.toLowerCase())).map(([name,pin])=><tr key={name}><td>{name}</td><td>{pin.pin}</td><td>{pin.standard}</td></tr>)}</tbody></table></div></aside>}
    </div>
    <footer className="statusbar"><button title="Toggle navigator · ⌘B" onClick={()=>setSidebar(!sidebar)}>☰</button><button onClick={()=>setPanel('problems')} title="Show problems">⊗ {errors}　△ {warnings}</button><span>{state?.busy?'Running':dirty?'Unsaved changes':ready?'Build current':'Ready to edit'}</span><span className="status-spacer"/><span title={state?.tools.root}>{state?.tools.installed?'Native tools ready':'Tools required'}</span><span>{current?`Ln ${position.line}, Col ${position.column}`:'No file open'}</span><span>{state?.target.verified?'USB target identified':state?.target.state==='disconnected'?'USB disconnected':state?.target.state==='error'?'USB check failed':'USB not checked'}</span></footer>
    {closing&&<div className="dialog-scrim"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="save-title"><h2 id="save-title">Save changes to {filename(closing.path)}?</h2><p>Your changes have not been saved to disk.</p><div className="dialog-actions"><button onClick={()=>setClosing(undefined)}>Cancel</button><button onClick={()=>{removeTab(closing.path);setClosing(undefined);}}>Discard</button><button className="primary" onClick={()=>void guard(async()=>{await api.writeFile(closing.path,closing.content);removeTab(closing.path);setClosing(undefined);})}>Save & close</button></div></section></div>}
    {newFile!==undefined&&<div className="dialog-scrim"><form className="dialog" onSubmit={e=>{e.preventDefault();void guard(async()=>{await api.createFile(newFile);setNewFile(undefined);await openFile(newFile);});}} role="dialog" aria-modal="true" aria-labelledby="new-file-title"><h2 id="new-file-title">New project file</h2><label>Path relative to project<input autoFocus value={newFile} onChange={e=>setNewFile(e.target.value)} placeholder="rtl/module.v"/></label><p>Use an existing folder. Add the file to macvivado.json to include it in a run.</p><div className="dialog-actions"><button type="button" onClick={()=>setNewFile(undefined)}>Cancel</button><button className="primary" type="submit">Create file</button></div></form></div>}
  </div>;
}
