import { it,expect,beforeAll,afterAll } from 'vitest';
import { promises as fs, appendFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Toolchain,type ToolLock } from '../src/core/toolchain';
import { Pipeline,assertProgrammable } from '../src/core/pipeline';
import { Controller } from '../src/electron/controller';
import type { RunRecord } from '../src/shared/types';
let root:string,tools:Toolchain,lock:ToolLock,good:RunRecord;
beforeAll(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'MacVivado real native path with spaces '));
  await fs.cp('examples/blink',root,{recursive:true});
  lock=JSON.parse(await fs.readFile('resources/toolchain.lock.json','utf8'));
  tools=new Toolchain(path.resolve(process.env.MACVIVADO_TOOLCHAIN_ROOT??'.cache/toolchain'),lock);
  expect((await tools.verify()).installed).toBe(true);
  good=await new Pipeline(tools,()=>{}).run(root,'build',new AbortController().signal);
  expect(good.status).toBe('success');
},30000);
afterAll(async()=>{await fs.rm(root,{recursive:true,force:true});});
it('builds a real bitstream and rejects stale, tampered, failed, or canceled records',async()=>{
  expect((await fs.stat(good.bitstream!)).size).toBeGreaterThan(3000000);
  await expect(assertProgrammable(root,good,tools)).resolves.toBe(good.bitstream);
  await expect(assertProgrammable(root,{...good,status:'failed'},tools)).rejects.toThrow('successful');
  await expect(assertProgrammable(root,{...good,status:'canceled'},tools)).rejects.toThrow('successful');
  const filename=path.join(root,'rtl/top.v'),original=await fs.readFile(filename);
  await fs.appendFile(filename,'\n// Changed input\n');await expect(assertProgrammable(root,good,tools)).rejects.toThrow('stale');await fs.writeFile(filename,original);
  const bit=await fs.readFile(good.bitstream!);await fs.writeFile(good.bitstream!,Buffer.concat([bit,Buffer.from('tampered')]));
  await expect(assertProgrammable(root,good,tools)).rejects.toThrow('checksum');await fs.writeFile(good.bitstream!,bit);
});
it('shows native syntax diagnostics and prevents an old successful build becoming ready after a failure',async()=>{
  const controller=new Controller(path.resolve('resources'),path.join(root,'tool storage'),lock,tools,()=>{});
  await controller.initialize();
  await controller.open(root);expect(controller.state.ready?.id).toBe(good.id);
  const source=await fs.readFile(path.join(root,'rtl/top.v'),'utf8');await fs.writeFile(path.join(root,'rtl/top.v'),'module top( this is not verilog; endmodule');
  await controller.run('build');expect(controller.state.ready).toBeUndefined();expect(controller.state.activeJob?.status).toBe('failed');
  expect(controller.state.activeJob?.diagnostics.some(d=>d.file==='rtl/top.v')).toBe(true);
  await fs.writeFile(path.join(root,'rtl/top.v'),source);controller.close();
},30000);
it('reports unsupported constraints before routing',async()=>{
  const name=path.join(root,'constraints/nexys.xdc'),original=await fs.readFile(name,'utf8');await fs.appendFile(name,'\nset_false_path -from [get_ports {CLK100MHZ}]\n');
  const record=await new Pipeline(tools,()=>{}).run(root,'build',new AbortController().signal);expect(record.status).toBe('failed');
  expect(record.stages).not.toContain('Place & route · nextpnr');expect(record.diagnostics.some(d=>d.file==='constraints/nexys.xdc')).toBe(true);await fs.writeFile(name,original);
});
it('cancels a running Icarus simulation and marks changed inputs stale',async()=>{
  const tb=path.join(root,'sim/tb.v'),original=await fs.readFile(tb,'utf8');
  await fs.writeFile(tb,'`timescale 1ns/1ps\nmodule tb; reg c=0; always #5 c=~c; initial begin $dumpfile("wave.vcd"); $dumpvars; end endmodule\n');
  const abort=new AbortController();
  const canceled=await new Pipeline(tools,()=>{}).run(root,'simulate',abort.signal,r=>{if(r.stages.at(-1)==='Run testbench')setTimeout(()=>abort.abort(),20);});
  expect(canceled.status).toBe('canceled');await fs.writeFile(tb,original);
  let changed=false;
  const stale=await new Pipeline(tools,()=>{}).run(root,'simulate',new AbortController().signal,r=>{if(!changed && r.stages.at(-1)==='Run testbench'){changed=true;appendFileSync(tb,'\n// Input changed during simulation\n');}});
  expect(stale.status).toBe('stale');await fs.writeFile(tb,original);
});
it('runs synthesis with source and include paths containing spaces',async()=>{
  const manifest=path.join(root,'macvivado.json'),original=await fs.readFile(manifest,'utf8'),source=await fs.readFile(path.join(root,'rtl/top.v'),'utf8');
  await fs.mkdir(path.join(root,'include files'));await fs.writeFile(path.join(root,'include files/parameters.vh'),'`define HALF 50000000\n');
  await fs.rename(path.join(root,'rtl/top.v'),path.join(root,'rtl/My top file.v'));
  await fs.writeFile(path.join(root,'rtl/My top file.v'),'`include "parameters.vh"\n'+source.replace('HALF_PERIOD = 50000000','HALF_PERIOD = `HALF'));
  const config=JSON.parse(original);config.sources=['rtl/My top file.v'];config.includeDirectories=['include files'];await fs.writeFile(manifest,JSON.stringify(config));
  const record=await new Pipeline(tools,()=>{}).run(root,'build',new AbortController().signal);expect(record.status,record.message+'\n'+JSON.stringify(record.diagnostics)).toBe('success');
  await fs.rename(path.join(root,'rtl/My top file.v'),path.join(root,'rtl/top.v'));await fs.writeFile(path.join(root,'rtl/top.v'),source);await fs.writeFile(manifest,original);await fs.rm(path.join(root,'include files'),{recursive:true});
},30000);
