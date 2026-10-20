import {test,expect,_electron as electron,type ElectronApplication} from '@playwright/test';
import {promises as fs} from 'node:fs';
import path from 'node:path';
test('desktop editing, save/reopen, simulation, waveforms, builds, diagnostics, and keyboard navigation',async()=>{
  const root=path.resolve('.cache/e2e/Project with spaces'),profile=path.resolve('.cache/e2e/profile');
  await fs.mkdir(root,{recursive:true});await fs.mkdir(profile,{recursive:true});await fs.cp('examples/blink',root,{recursive:true});
  const start=()=>electron.launch({args:['.'],env:{...process.env,MACVIVADO_USER_DATA:profile,MACVIVADO_TOOLCHAIN_ROOT:path.resolve('.cache/toolchain'),MACVIVADO_PROJECT:root}});
  let app:ElectronApplication=await start();let page=await app.firstWindow();
  console.log('Desktop window created');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await expect(page.getByRole('tab',{name:'V top.v'})).toBeVisible();
    await expect(page.getByText('Native tools ready',{exact:true})).toBeVisible();
    console.log('Project and native tools loaded');
    expect(await page.evaluate(()=>({require:typeof (window as unknown as {require?:unknown}).require,process:typeof (window as unknown as {process?:unknown}).process}))).toEqual({require:'undefined',process:'undefined'});
    await expect(page.getByRole('button',{name:'Program',exact:true})).toBeDisabled();
    // Use the actual Monaco keyboard path and native Save accelerator.
    const source=await fs.readFile(path.join(root,'rtl/top.v'),'utf8');
    await page.locator('.monaco-editor .view-lines').click({position:{x:140,y:38}});await page.keyboard.press('Meta+A');await page.keyboard.insertText(source+'\n// Saved through the desktop editor\n');
    await expect(page.getByText('Unsaved changes',{exact:true})).toBeVisible();await page.keyboard.press('Meta+S');
    console.log('Keyboard edit and Save dispatched');
    await expect.poll(()=>fs.readFile(path.join(root,'rtl/top.v'),'utf8')).toContain('Saved through the desktop editor');
    console.log('Save verified on disk');
    await page.keyboard.press('Meta+B');await expect(page.locator('.navigator')).toHaveCount(0);await page.keyboard.press('Meta+B');await expect(page.locator('.navigator')).toBeVisible();
    await page.getByRole('button',{name:'Simulate',exact:true}).click();await expect(page.locator('.run-summary')).toContainText('Simulation completed',{timeout:30000});
    console.log('Simulation completed');
    await expect(page.getByRole('tab',{name:'Waveforms',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('.wave-row').first()).toBeVisible();
    await page.getByLabel('Cursor A time').fill('35000');await page.getByLabel('Cursor B time').fill('75000');
    await expect(page.getByText('Δ 40000 ticks',{exact:false})).toBeVisible();await page.getByTitle('Zoom in',{exact:true}).click();await expect(page.getByText('2×',{exact:true})).toBeVisible();
    await page.getByLabel('Waveform value format').selectOption('binary');await page.getByLabel('Filter signals').fill('LED');await expect(page.locator('.signal-picker label')).toHaveCount(2);
    await page.getByRole('button',{name:'Build',exact:true}).click();await expect(page.locator('.run-summary')).toContainText('Bitstream generated',{timeout:30000});await expect(page.getByText('Build current',{exact:true})).toBeVisible();
    await page.screenshot({path:'.cache/e2e/workbench.png'});
    await page.locator('.monaco-editor .view-lines').click({position:{x:140,y:38}});await page.keyboard.press('Meta+A');await page.keyboard.insertText('module top;\nthis is invalid verilog;\nendmodule\n');await page.keyboard.press('Meta+S');
    await page.getByRole('button',{name:'Simulate',exact:true}).click();await expect(page.getByRole('tab',{name:/Problems/})).toHaveAttribute('aria-selected','true',{timeout:30000});
    await expect(page.locator('.diagnostic').first()).toBeVisible();await page.locator('.diagnostic').first().click();await expect(page.locator('.statusbar')).toContainText('Ln 2');
    await page.locator('.monaco-editor .view-lines').click({position:{x:140,y:38}});await page.keyboard.press('Meta+A');await page.keyboard.insertText(source+'\n// Saved through the desktop editor\n');await page.keyboard.press('Meta+S');
    // Closing and relaunching verifies disk persistence and app-managed editor initialization.
    await app.evaluate(({app})=>app.exit(0));app=await start();page=await app.firstWindow();await expect(page.getByRole('tab',{name:'V top.v'})).toBeVisible();
    await expect(page.locator('.monaco-editor')).toContainText('Saved through the desktop editor');
    expect(errors).toEqual([]);
  } finally {await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
});
