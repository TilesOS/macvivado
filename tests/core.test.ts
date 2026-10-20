import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateConstraints } from '../src/core/constraints';
import { loadProject,inputSnapshot,projectPath } from '../src/core/project';
import { parseVcd,valueAt,formatValue } from '../src/core/vcd';
import { runCommand } from '../src/core/runner';
import { Toolchain, downloadVerified, installToolchain, type ToolLock } from '../src/core/toolchain';
import { requestSchema } from '../src/shared/ipc';
import { parseDiagnostics } from '../src/core/diagnostics';

let root:string;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'MacVivado test with spaces '));});
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();await fs.rm(root,{recursive:true,force:true});});
const file=(text:string)=>[{file:'constraints/nexys.xdc',text}];
const pin=(port:string,pin:string,std='LVCMOS33')=>`set_property -dict { PACKAGE_PIN ${pin} IOSTANDARD ${std} } [get_ports { ${port} }];`;
describe('Digilent constraint validation',()=>{
  it('keeps 1.8 V switches and rejects unsafe substitutions',()=>{
    expect(validateConstraints(file(pin('SW[8]','T8','LVCMOS18'))).diagnostics).toEqual([]);
    expect(validateConstraints(file(pin('SW[8]','T8'))).diagnostics[0].message).toContain('LVCMOS18');
  });
  it('rejects duplicate pins, unknown pins, missing voltage, and missing top ports',()=>{
    expect(validateConstraints(file(pin('a','H17')+'\n'+pin('b','H17'))).diagnostics.some(d=>d.message.includes('already'))).toBe(true);
    expect(validateConstraints(file(pin('a','A99'))).diagnostics[0].message).toContain('not a supported');
    expect(validateConstraints(file('set_property PACKAGE_PIN H17 [get_ports {a}]')).diagnostics[0].message).toContain('both');
    expect(validateConstraints(file(pin('wrong','H17')),{LED:{direction:'output',bits:[1]}}).diagnostics.map(d=>d.message).join()).toMatch(/does not exist.*no pin/);
  });
  it('checks oscillator targets, period, and unsupported timing commands',()=>{
    const xdc=pin('clk','E3')+'\ncreate_clock -period 10 [get_ports {clk}]';
    expect(validateConstraints(file(xdc),{clk:{direction:'input',bits:[1]}}).diagnostics).toEqual([]);
    expect(validateConstraints(file(xdc.replace('-period 10','-period 20'))).diagnostics[0].message).toContain('100 MHz');
    expect(validateConstraints(file('set_false_path -from [get_ports {clk}]')).diagnostics[0].message).toContain('Unsupported');
    expect(validateConstraints(file('set_property IOSTANDARD LVCMOS33 [get_ports {*}]')).diagnostics[0].message).toContain('Wildcards');
    expect(validateConstraints(file('source hacked.tcl')).diagnostics[0].message).toContain('Unsupported');
  });
});
describe('portable project inputs',()=>{
  it('opens versioned config and fingerprints includes and data files',async()=>{
    await fs.cp('examples/blink',root,{recursive:true});await fs.mkdir(path.join(root,'include files'));
    await fs.writeFile(path.join(root,'include files/defs.vh'),'`define TEST 1');
    const first=await inputSnapshot(root,'tools');
    await fs.writeFile(path.join(root,'include files/defs.vh'),'`define TEST 2');
    expect((await inputSnapshot(root,'tools')).fingerprint).not.toBe(first.fingerprint);
    expect((await loadProject(root)).config.top).toBe('top');
    const config=JSON.parse(await fs.readFile(path.join(root,'macvivado.json'),'utf8'));config.version=2;
    await fs.writeFile(path.join(root,'macvivado.json'),JSON.stringify(config));await expect(loadProject(root)).rejects.toThrow();
  });
  it('rejects traversal and symlink inputs',async()=>{
    await expect(projectPath(root,'../outside.v')).rejects.toThrow();
    await fs.symlink('/etc/hosts',path.join(root,'link.v'));
    await expect(projectPath(root,'link.v')).rejects.toThrow();
  });
  it('checks IPC shapes and forbids arbitrary executable and flash arguments',()=>{
    expect(requestSchema.safeParse({method:'run',action:'build',executable:'/bin/sh'}).success).toBe(false);
    expect(requestSchema.safeParse({method:'program',flash:true}).success).toBe(false);
    expect(requestSchema.safeParse({method:'readFile',path:'../../.ssh/id_rsa'}).success).toBe(false);
  });
});
describe('VCD values and bounds',()=>{
  const vcd='$timescale 1 ps $end\n$scope module tb $end\n$var wire 4 ! bus [3:0] $end\n$var wire 1 " clk $end\n$upscope $end\n$enddefinitions $end\n#0\nbx !\n0"\n#10\nb1010 !\n1"\n#20\nb0011 !\n0"\n';
  it('reads scopes, bus values, both cursors, and hex formatting',()=>{
    const wave=parseVcd(vcd);expect(wave.timescale).toBe('1 ps');expect(wave.endTime).toBe(20);
    expect(wave.signals[0].name).toBe('tb.bus [3:0]');expect(valueAt(wave.signals[0],9)).toBe('xxxx');
    expect(formatValue(valueAt(wave.signals[0],10),'hex')).toBe('A');expect(valueAt(wave.signals[0],20)).toBe('0011');
  });
  it('bounds transitions and rejects malformed or huge waveforms',()=>{
    expect(parseVcd(vcd,2).truncated).toBe(true);expect(()=>parseVcd('no vcd')).toThrow();expect(()=>parseVcd('x'.repeat(16*1024*1024+1))).toThrow('16 MiB');
  });
});
describe('bounded real process execution',()=>{
  it('uses argument arrays through paths with spaces and shell metacharacters',async()=>{
    const argument='a file with spaces; $(touch should-not-exist)';
    const out=await runCommand({executable:process.execPath,args:['-e','process.stdout.write(process.argv[1])',argument],cwd:root});
    expect(out).toBe(argument);expect(await fs.readdir(root)).toEqual([]);
  });
  it('reports launch failure and nonzero exits',async()=>{
    await expect(runCommand({executable:path.join(root,'missing'),args:[],cwd:root})).rejects.toThrow('Cannot launch');
    await expect(runCommand({executable:process.execPath,args:['-e','process.exit(12)'],cwd:root})).rejects.toThrow('12');
  });
  it('kills canceled children and enforces runtime/output limits',async()=>{
    const controller=new AbortController();setTimeout(()=>controller.abort(),80);
    await expect(runCommand({executable:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:root,signal:controller.signal})).rejects.toMatchObject({canceled:true});
    await expect(runCommand({executable:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:root,timeoutMs:80})).rejects.toThrow('runtime limit');
    await expect(runCommand({executable:process.execPath,args:['-e','process.stdout.write("x".repeat(20000))'],cwd:root,maxOutputBytes:1000})).rejects.toThrow('output limit');
  });
  it('enforces a waveform file limit while a producer is running',async()=>{
    const waveform=path.join(root,'wave.vcd');
    await expect(runCommand({executable:process.execPath,args:['-e','require("fs").writeFileSync("wave.vcd","x".repeat(10000));setInterval(()=>{},1000)'],cwd:root,boundedFiles:[{path:waveform,maxBytes:100}]})).rejects.toThrow('Waveform output');
  });
});
describe('checksum verified tool installation',()=>{
  const lock:ToolLock={version:1,id:'test',platform:'darwin-arm64',sources:{},archives:[],files:{'missing':'f'.repeat(64)}};
  it('reports missing tools and failed HTTP downloads',async()=>{
    expect((await new Toolchain(root,lock).verify()).installed).toBe(false);
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('Unavailable',{status:503})));
    await expect(downloadVerified('https://example.test/tools',path.join(root,'x.tgz'),'0'.repeat(64),4)).rejects.toThrow('HTTP 503');
    expect(await fs.readdir(root)).toEqual([]);
  });
  it('deletes corrupt downloads and rejects checksum mismatch before extracting',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('bad!')));
    await expect(downloadVerified('https://example.test/tools',path.join(root,'x.tgz'),'0'.repeat(64),4)).rejects.toThrow('SHA-256');
    await fs.mkdir(path.join(root,'resources/tools'),{recursive:true});await fs.writeFile(path.join(root,'resources/tools/x.tgz'),'bad!');
    await expect(installToolchain(path.join(root,'storage'),path.join(root,'resources'),{...lock,archives:[{name:'x.tgz',sha256:'0'.repeat(64),bytes:4}]},()=>{})).rejects.toThrow('Checksum mismatch');
    expect(await fs.readdir(path.join(root,'storage'))).toEqual([]);
  });
});
it('navigates fatal testbench diagnostics to the actual file',()=>{
  expect(parseDiagnostics('FATAL: sim/tb.v:12: expected output\n')[0]).toMatchObject({file:'sim/tb.v',line:12});
  expect(parseDiagnostics('sim/tb.v:14: $finish called at 156000 (1ps)\n')).toEqual([]);
});
