import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Controller } from './controller';
import { Toolchain, type ToolLock } from '../core/toolchain';
import { requestSchema } from '../shared/ipc';
import type { AppEvent } from '../shared/types';

let window: BrowserWindow|undefined, controller: Controller;
let poll: ReturnType<typeof setInterval>;
const resources=app.isPackaged?path.join(process.resourcesPath,'resources'):path.resolve('resources');
const examples=app.isPackaged?path.join(process.resourcesPath,'examples'):path.resolve('examples');
const send=(event: AppEvent)=>{ if(window && !window.isDestroyed()) window.webContents.send('macvivado:event',event); };
const command=(command: Extract<AppEvent,{type:'command'}>['command'])=>()=>send({type:'command',command});
app.setName('MacVivado');
if(!app.isPackaged && process.env.MACVIVADO_USER_DATA) app.setPath('userData',path.resolve(process.env.MACVIVADO_USER_DATA));
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{window?.show();window?.focus();});
  void app.whenReady().then(async()=> {
    const lock=JSON.parse(await fs.readFile(path.join(resources,'toolchain.lock.json'),'utf8')) as ToolLock;
    const storage=path.join(app.getPath('userData'),'toolchains');
    const toolsRoot=!app.isPackaged && process.env.MACVIVADO_TOOLCHAIN_ROOT ? path.resolve(process.env.MACVIVADO_TOOLCHAIN_ROOT):path.join(storage,lock.id);
    controller=new Controller(resources,storage,lock,new Toolchain(toolsRoot,lock),send);
    window=new BrowserWindow({width:1440,height:940,minWidth:940,minHeight:640,title:'MacVivado',titleBarStyle:'hiddenInset',backgroundColor:'#1e1e1e',show:false,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    window.webContents.on('will-prevent-unload',event=> {
      const result=dialog.showMessageBoxSync(window!,{type:'question',buttons:['Stay','Discard changes'],defaultId:0,cancelId:0,message:'You have unsaved files.',detail:'Save your work before closing MacVivado.'});
      if(result===1) event.preventDefault();
    });
    ipcMain.handle('macvivado:request',async(event,raw)=> {
      if(event.sender!==window?.webContents || event.senderFrame!==window.webContents.mainFrame) return {ok:false,error:'Untrusted IPC sender.'};
      try {
        const request=requestSchema.parse(raw); let value: unknown;
        switch(request.method) {
          case 'state': value=controller.state; break;
          case 'openProject': {
            const result=await dialog.showOpenDialog(window!,{title:'Open MacVivado project folder',properties:['openDirectory']});
            if(!result.canceled) { value=await controller.open(result.filePaths[0]); await fs.writeFile(path.join(app.getPath('userData'),'recent-project.txt'),result.filePaths[0]); } break;
          }
          case 'createExample': {
            const result=await dialog.showSaveDialog(window!,{title:'Create example project folder',defaultPath:path.join(app.getPath('documents'),`MacVivado ${request.example}`),buttonLabel:'Create project'});
            if(!result.canceled && result.filePath) {
              await fs.mkdir(result.filePath); await fs.cp(path.join(examples,request.example),result.filePath,{recursive:true,filter:source=>!source.split(path.sep).includes('.macvivado')});
              value=await controller.open(result.filePath); await fs.writeFile(path.join(app.getPath('userData'),'recent-project.txt'),result.filePath);
            } break;
          }
          case 'readFile': value=await controller.read(request.path); break;
          case 'writeFile': await controller.write(request.path,request.content); break;
          case 'createFile': await controller.createFile(request.path); break;
          case 'run': await controller.run(request.action); break;
          case 'cancel': controller.cancel(); break;
          case 'installTools': await controller.install(); break;
          case 'scanDevices': await controller.scan(); break;
          case 'selectDevice': await controller.selectDevice(request.serial); break;
          case 'program': await controller.program(); break;
          case 'revealArtifacts': { const record=controller.state.builds.find(r=>r.id===request.id); if(!record) throw new Error('Artifact not found.'); await shell.openPath(record.directory); break; }
          case 'readRun': { const record=controller.state.builds.find(r=>r.id===request.id); if(!record) throw new Error('Run not found.'); const log=await fs.readFile(path.join(record.directory,'run.log'),'utf8').catch(()=>''); value={record,log:log.slice(-1024*1024)}; break; }
        }
        return {ok:true,value};
      } catch(e) { return {ok:false,error:(e as Error).message}; }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'MacVivado',submenu:[{role:'about'},{type:'separator'},{label:'Install / repair native tools',click:()=>void controller.install()},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
      {label:'File',submenu:[{label:'Open project…',accelerator:'CmdOrCtrl+O',click:command('open')},{label:'Save',accelerator:'CmdOrCtrl+S',click:command('save')},{label:'Save all',accelerator:'CmdOrCtrl+Alt+S',click:command('saveAll')},{label:'Close editor',accelerator:'CmdOrCtrl+W',click:command('closeTab')}]},
      {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'Run',submenu:[{label:'Simulate',accelerator:'F5',click:command('simulate')},{label:'Build bitstream',accelerator:'CmdOrCtrl+Shift+B',click:command('build')},{label:'Program volatile SRAM',accelerator:'CmdOrCtrl+Alt+P',click:command('program')},{label:'Cancel run',accelerator:'Shift+F5',click:()=>controller.cancel()}]},
      {label:'View',submenu:[{label:'Toggle project navigator',accelerator:'CmdOrCtrl+B',click:command('toggleSidebar')},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools' as const}]:[])]},
      {label:'Window',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]}
    ]));
    await window.loadFile(path.join(__dirname,'../renderer/index.html')); window.show();
    await controller.initialize();
    const recent=!app.isPackaged && process.env.MACVIVADO_PROJECT ? process.env.MACVIVADO_PROJECT:await fs.readFile(path.join(app.getPath('userData'),'recent-project.txt'),'utf8').catch(()=>undefined);
    if(recent) try{await controller.open(recent);}catch{}
    poll=setInterval(()=>void controller.scan(),5000);
  }).catch(error=>{dialog.showErrorBox('MacVivado could not start',error.message);app.quit();});
}
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{clearInterval(poll);controller?.close();});
