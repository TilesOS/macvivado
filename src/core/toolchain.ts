import { promises as fs } from 'node:fs';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileSha256, atomicJson } from './project';
import { runCommand } from './runner';
import type { ToolState } from '../shared/types';

export type ToolLock = { version: 1; id: string; platform: 'darwin-arm64'; sources: Record<string,string>;
  archives: { name: string; sha256: string; bytes: number; url?: string }[]; files: Record<string,string> };
export type Log = (stream: 'stdout'|'stderr'|'system', text: string) => void;
export class Toolchain {
  constructor(public root: string, public lock: ToolLock) {}
  get id() { return this.lock.id; }
  get oss() { return path.join(this.root, 'oss-cad-suite'); }
  get xc7() { return path.join(this.root, 'openxc7'); }
  tool(name: 'yosys'|'iverilog'|'vvp'|'openFPGALoader'|'tabbypy3'|'nextpnr-himbaechel'|'xc7frames2bit') {
    return path.join(['nextpnr-himbaechel','xc7frames2bit'].includes(name) ? this.xc7 : this.oss, 'bin', name);
  }
  get env(): NodeJS.ProcessEnv {
    return { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'en_US.UTF-8', LC_ALL: 'C',
      PATH: `${this.xc7}/bin:${this.oss}/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
      PYTHONPATH: `${this.xc7}/python`, PYTHONNOUSERSITE: '1',
      PRJXRAY_DB_DIR: `${this.xc7}/share`, SSL_CERT_FILE: `${this.oss}/etc/cacert.pem` };
  }
  async verify(): Promise<ToolState> {
    try {
      for (const [file, expected] of Object.entries(this.lock.files)) {
        if (await fileSha256(path.join(this.root,file)) !== expected) throw new Error(`Checksum mismatch: ${file}`);
      }
      for (const name of ['yosys','iverilog','vvp','openFPGALoader','tabbypy3','nextpnr-himbaechel','xc7frames2bit'] as const) await fs.access(this.tool(name), fs.constants.X_OK);
      return { installed: true, id: this.id, root: this.root, message: 'Verified native Apple Silicon tools' };
    } catch (e) { return { installed: false, id: this.id, root: this.root, message: `Install or repair tools: ${(e as Error).message}` }; }
  }
}
export async function downloadVerified(url: string, destination: string, sha256: string, bytes: number, signal?: AbortSignal) {
  if (!url.startsWith('https://')) throw new Error('Downloads require HTTPS.');
  try {
    const response = await fetch(url, { signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(120000)]) });
    if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
    let count = 0;
    const stream = Readable.fromWeb(response.body as never);
    stream.on('data', chunk => { count += chunk.length; if (count > bytes) stream.destroy(new Error('Download exceeds pinned size.')); });
    await pipeline(stream, createWriteStream(destination, { flags: 'wx' }), { signal });
    if (count !== bytes || await fileSha256(destination) !== sha256) throw new Error('Downloaded archive failed SHA-256/size verification.');
  } catch (e) { await fs.rm(destination, { force: true }); throw e; }
}
export async function installToolchain(storage: string, resources: string, lock: ToolLock, log: Log, signal?: AbortSignal) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This tool bundle requires an Apple Silicon Mac.');
  await fs.mkdir(storage, { recursive: true });
  const staging = await fs.mkdtemp(path.join(storage, '.install-'));
  try {
    for (const archive of lock.archives) {
      if (signal?.aborted) throw new Error('Installation canceled.');
      let source = path.join(resources, 'tools', archive.name);
      if (!(await fs.stat(source).catch(() => undefined))) {
        if (!archive.url) throw new Error(`Bundled archive missing: ${archive.name}. Reinstall MacVivado.`);
        source = path.join(staging, archive.name);
        log('system', `Downloading ${archive.name}\n`);
        await downloadVerified(archive.url, source, archive.sha256, archive.bytes, signal);
      }
      log('system', `Verifying SHA-256: ${archive.name}\n`);
      if ((await fs.stat(source)).size !== archive.bytes || await fileSha256(source) !== archive.sha256) throw new Error(`Checksum mismatch: ${archive.name}. No tools were installed.`);
      const listing = await runCommand({ executable: '/usr/bin/tar', args: ['-tzf',source], cwd: staging, signal, maxOutputBytes: 16*1024*1024 });
      if (listing.split('\n').some(p => p.startsWith('/') || p.split('/').includes('..'))) throw new Error('Unsafe archive path.');
      log('system', `Extracting ${archive.name}\n`);
      await runCommand({ executable: '/usr/bin/tar', args: ['-xzf',source,'-C',staging], cwd: staging, signal, timeoutMs: 300000 });
    }
    const tools = new Toolchain(staging, lock);
    const verified = await tools.verify();
    if (!verified.installed) throw new Error(verified.message);
    await atomicJson(path.join(staging, 'installed.json'), lock);
    const destination = path.join(storage, lock.id);
    const previous = destination + '.previous';
    await fs.rm(previous, { recursive: true, force: true });
    if (await fs.stat(destination).catch(() => undefined)) await fs.rename(destination, previous);
    try { await fs.rename(staging, destination); } catch (e) { if (await fs.stat(previous).catch(() => undefined)) await fs.rename(previous,destination); throw e; }
    await fs.rm(previous, { recursive: true, force: true });
    log('system', 'Native tools installed and verified.\n');
    return new Toolchain(destination,lock);
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
}
