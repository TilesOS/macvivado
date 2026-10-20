import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileSha256, atomicJson } from '../src/core/project';
import { runCommand } from '../src/core/runner';
import type { ToolLock } from '../src/core/toolchain';

// Run scripts/bootstrap-native.sh first. This packages already-built, pinned native inputs.
const root = path.resolve('.cache/toolchain');
await fs.mkdir('resources/tools',{recursive:true});
const ossName = 'oss-cad-suite-darwin-arm64-20261019.tgz';
const ossHash = 'be3a09ae67c5c52cca5200ca8978626b3e7efcecf30f65735ff7db0eaf6c4b6f';
if (await fileSha256(`.cache/downloads/${ossName}`) !== ossHash) throw new Error('OSS archive checksum mismatch.');
await runCommand({executable:'/usr/bin/python3',args:['scripts/relocate-native.py'],cwd:process.cwd(),onLog:(_,s)=>process.stdout.write(s)});
const xc7Name = 'openxc7-3e5c2cdd-darwin-arm64.tgz';
await runCommand({executable:'/usr/bin/tar',args:['-czf',path.resolve('resources/tools',xc7Name),'--exclude=__pycache__','-C',root,'openxc7'],cwd:process.cwd()});
await fs.copyFile(`.cache/downloads/${ossName}`,`resources/tools/${ossName}`);
const lock: ToolLock = {version:1,id:'xc7-3e5c2cdd-oss-20261019',platform:'darwin-arm64',sources:{
  nextpnr:'https://github.com/openXC7/nextpnr/tree/3e5c2cdd256745fb5adb93f3ffe8c3795b1e7abf',
  prjxray:'https://github.com/openXC7/prjxray/tree/ed3331c6200f421164101388759fc2860b0f5634',
  database:'https://github.com/openXC7/prjxray-db/tree/517d66a383676cb971177ea92b0ff3b6ea6e8690',
  metadata:'https://github.com/openXC7/nextpnr-xilinx-meta/tree/a4af910cac907f2cbd3a545f26f8e26573e860de',
  oss:'https://github.com/YosysHQ/oss-cad-suite-build/releases/tag/2026-10-19'
},archives:[],files:{}};
for (const name of [ossName,xc7Name]) lock.archives.push({name,sha256:await fileSha256(`resources/tools/${name}`),bytes:(await fs.stat(`resources/tools/${name}`)).size,...(name===ossName?{url:`https://github.com/YosysHQ/oss-cad-suite-build/releases/download/2026-10-19/${ossName}`}:{})});
async function inventory(dir: string) {
  for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})) {
    if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) continue;
    const file = path.posix.join(dir,entry.name);
    if(entry.isDirectory()) await inventory(file);
    else if(entry.isFile()) lock.files[file]=await fileSha256(path.join(root,file));
  }
}
await inventory('openxc7');
await inventory('oss-cad-suite/lib/ivl');
for(const file of ['yosys','yosys-abc','iverilog','vvp','openFPGALoader','python3.11']) {
  lock.files[`oss-cad-suite/libexec/${file}`]=await fileSha256(path.join(root,`oss-cad-suite/libexec/${file}`));
}
for(const file of ['yosys','iverilog','vvp','openFPGALoader','tabbypy3']) lock.files[`oss-cad-suite/bin/${file}`]=await fileSha256(path.join(root,`oss-cad-suite/bin/${file}`));
await atomicJson('resources/toolchain.lock.json',lock);
console.log(`Prepared ${lock.id}: ${Object.keys(lock.files).length} checked files, ${lock.archives.map(a=>Math.round(a.bytes/1048576)+' MiB').join(' + ')}`);
