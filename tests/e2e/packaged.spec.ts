import {test,expect,_electron as electron} from '@playwright/test';
import {promises as fs,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const appPath=process.env.MACVIVADO_PACKAGED_APP??path.resolve('release/mac-arm64/MacVivado.app');
const executable=path.join(appPath,'Contents/MacOS/MacVivado');
test('packaged ARM64 app installs offline tools and builds without a shell setup',async()=>{
  test.skip(!existsSync(executable),'Package MacVivado before this test.');
  const root=path.resolve(`.cache/packaged check/Project with spaces ${Date.now()}`);await fs.mkdir(root,{recursive:true});await fs.cp('examples/blink',root,{recursive:true});
  const app=await electron.launch({executablePath:executable,args:[],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:os.homedir(),LANG:'en_US.UTF-8'}});
  const page=await app.firstWindow();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    console.log('Packaged app launched',await app.evaluate(({app})=>({packaged:app.isPackaged,userData:app.getPath('userData')})));
    await expect.poll(()=>page.evaluate(async()=>{const state=await window.macvivado.state();return state.tools.message!=='Checking tools…'&&!state.busy;})).toBe(true);
    await page.getByRole('button',{name:'Toolchain and board settings'}).click();
    const install=page.getByRole('button',{name:'Install tools',exact:true});
    if(await install.isVisible()) {await install.click();await expect.poll(()=>page.evaluate(async()=>{const state=await window.macvivado.state();return state.tools.installed&&!state.busy;}),{timeout:90000}).toBe(true);}
    await expect(page.getByText('✓ Checksums verified',{exact:true})).toBeVisible();
    console.log('Verified native tools available in app-managed storage');
    await page.getByRole('button',{name:'Close settings',exact:true}).click();
    await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},root);
    await page.getByRole('button',{name:'Open',exact:true}).click();
    console.log('Project open requested',await page.evaluate(async()=>{const state=await window.macvivado.state();return{root:state.project?.root,busy:state.busy};}));
    try {await expect(page.getByRole('tab',{name:'V top.v'})).toBeVisible();} catch(e){console.log('Open error',await page.locator('.error-banner').allTextContents(),await page.evaluate(async()=>{const s=await window.macvivado.state();return {root:s.project?.root,busy:s.busy};}));throw e;}
    await page.getByRole('button',{name:'Simulate',exact:true}).click();await expect(page.locator('.run-summary')).toContainText('Simulation completed',{timeout:30000});
    await page.screenshot({path:'.cache/packaged check/waveforms.png'});
    await page.getByRole('button',{name:'Build',exact:true}).click();await expect(page.locator('.run-summary')).toContainText('Bitstream generated',{timeout:30000});
    await expect(page.getByRole('button',{name:'Program',exact:true})).toBeDisabled();
    console.log('Packaged simulation and bitstream succeeded; disconnected Program remains disabled');
    // The next Finder launch should show the welcome screen, not a temporary test project.
    const recent=path.join(await app.evaluate(({app})=>app.getPath('userData')),'recent-project.txt');
    if(await fs.readFile(recent,'utf8').catch(()=>'')===root)await fs.rm(recent,{force:true});
    expect(errors).toEqual([]);
  } finally {await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
});
