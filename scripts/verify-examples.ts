import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Pipeline } from '../src/core/pipeline';
import { Toolchain, type ToolLock } from '../src/core/toolchain';
const lock=JSON.parse(await fs.readFile('resources/toolchain.lock.json','utf8')) as ToolLock;
const tools=new Toolchain(path.resolve(process.env.MACVIVADO_TOOLCHAIN_ROOT ?? '.cache/toolchain'),lock);
const results=[];
for(const name of ['blink','switch-to-led','seven-segment']) {
  const root=path.resolve('.cache/verification/Projects with spaces',name);
  await fs.mkdir(root,{recursive:true}); await fs.cp(`examples/${name}`,root,{recursive:true,filter:p=>!p.includes('.macvivado')});
  for(const action of ['simulate','build'] as const) {
    let stage='';
    const record=await new Pipeline(tools,()=>{}).run(root,action,new AbortController().signal,r=>{
      const next=r.stages.at(-1) ?? 'Checking inputs'; if(next!==stage) { console.log(`${name}: ${next}`); stage=next; }
    });
    console.log(`${name} ${action}: ${record.status} ${record.message}`);
    results.push({...record,waveform:record.waveform?{signals:record.waveform.signals.length,endTime:record.waveform.endTime,timescale:record.waveform.timescale,truncated:record.waveform.truncated}:undefined});
    if(record.status!=='success') { console.error(record.diagnostics); process.exitCode=1; }
  }
}
await fs.writeFile('docs/example-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),platform:`${process.platform}-${process.arch}`,toolchain:lock.id,hardwareVerified:false,results},null,2)+'\n');
