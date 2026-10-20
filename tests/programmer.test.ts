import { describe,it,expect } from 'vitest';
import { Programmer,parseUsbScan,verifyIdentity } from '../src/core/programmer';
import { Toolchain, type ToolLock } from '../src/core/toolchain';
import type { Command } from '../src/core/runner';

// ISOLATED SOFTWARE FIXTURES. These strings never enter the Electron app or represent actual detection.
const header='Bus device vid:pid       probe_type manufacturer serial product';
function scan(serial='FIXTURE001',second=false) {
  const columns=['Bus','device','vid:pid','probe_type','manufacturer','serial','product'];
  const widths=[4,7,14,11,13,Math.max(7,serial.length+1)];
  const row=(values:string[])=>values.map((v,i)=>i<6?v.padEnd(widths[i]):v).join('');
  return row(columns)+'\n'+row(['001','002','0x0403:0x6010','FTDI2232','Digilent',serial,'Nexys A7'])+'\n'+(second?row(['001','003','0x0403:0x6010','FTDI2232','Digilent','FIXTURE002','Nexys A7'])+'\n':'');
}
const identity='Jtag frequency : requested 6.00MHz -> real 6.00MHz\nindex 0:\n\tidcode  0x3631093\n\tmanufacturer xilinx\n\tfamily artix a7 100t\n\tmodel xc7a100\n\tirlength 6\n';
const lock:ToolLock={version:1,id:'fixture-only',platform:'darwin-arm64',sources:{},files:{},archives:[]};
const tools=new Toolchain('/isolated fixtures only',lock);
describe('programmer orchestration — no hardware involved',()=>{
  it('distinguishes USB enumeration from verified FPGA identity',async()=>{
    expect(parseUsbScan('No USB devices found\n'+header)).toEqual([]);
    expect(parseUsbScan(scan())[0].serial).toBe('FIXTURE001');expect(verifyIdentity(identity)).toContain('XC7A100T');
    expect(()=>verifyIdentity(identity.replace('3631093','362c093'))).toThrow('Target mismatch');
    expect(()=>verifyIdentity(identity+identity)).toThrow('Target mismatch');
  });
  it('requires a selection when multiple compatible cables are present',async()=>{
    const programmer=new Programmer(tools,async()=>scan('FIXTURE001',true));
    const result=await programmer.scan();expect(result.verified).toBe(false);expect(result.message).toContain('Multiple');
  });
  it('always checks the serial and identity before programming only SRAM',async()=>{
    const commands:Command[]=[];let validated=false;
    const programmer=new Programmer(tools,async c=>{commands.push(c);return c.args.includes('--scan-usb')?scan():c.args.includes('--detect')?identity:'Programming done';});
    const result=await programmer.program('FIXTURE001','/a project with spaces/current.bit',new AbortController().signal,()=>{},async()=>{validated=true;});
    expect(result.verified).toBe(true);expect(validated).toBe(true);
    const write=commands.find(c=>c.args.includes('--write-sram'))!;
    expect(write.args).toEqual(['--board','nexys_a7_100','--usb-serial-num','FIXTURE001','--write-sram','/a project with spaces/current.bit']);
    expect(commands.flatMap(c=>c.args)).not.toContain('--write-flash');expect(commands.at(-1)!.args).toContain('--detect');
  });
  it('blocks disconnected or mismatched targets before a write',async()=>{
    let writes=0;
    const programmer=new Programmer(tools,async c=>{if(c.args.includes('--write-sram'))writes++;return c.args.includes('--scan-usb')?scan():identity.replace('3631093','362c093');});
    await expect(programmer.program('FIXTURE001','x.bit',new AbortController().signal,()=>{},async()=>{})).rejects.toThrow('Target mismatch');expect(writes).toBe(0);
    const disconnected=new Programmer(tools,async()=>header+'\n');
    await expect(disconnected.program('FIXTURE001','x.bit',new AbortController().signal,()=>{},async()=>{})).rejects.toThrow('No compatible');
  });
  it('reports disconnects after programming and nonzero tool failures',async()=>{
    let written=false;
    const programmer=new Programmer(tools,async c=>{if(c.args.includes('--write-sram')){written=true;return '';}return c.args.includes('--scan-usb')?(written?header:scan()):identity;});
    await expect(programmer.program('FIXTURE001','x.bit',new AbortController().signal,()=>{},async()=>{})).rejects.toThrow('could not be confirmed');
    const failed=new Programmer(tools,async c=>{if(c.args.includes('--write-sram'))throw new Error('USB transfer failed');return c.args.includes('--scan-usb')?scan():identity;});
    await expect(failed.program('FIXTURE001','x.bit',new AbortController().signal,()=>{},async()=>{})).rejects.toThrow('USB transfer failed');
  });
  it('revalidates build provenance after identity detection',async()=>{
    let written=false;
    const programmer=new Programmer(tools,async c=>{if(c.args.includes('--write-sram'))written=true;return c.args.includes('--scan-usb')?scan():identity;});
    await expect(programmer.program('FIXTURE001','x.bit',new AbortController().signal,()=>{},async()=>{throw new Error('Build stale');})).rejects.toThrow('Build stale');expect(written).toBe(false);
  });
});
