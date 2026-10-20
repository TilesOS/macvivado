import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export type Command = { executable: string; args: string[]; cwd: string; env?: NodeJS.ProcessEnv;
  signal?: AbortSignal; timeoutMs?: number; maxOutputBytes?: number; stdoutFile?: string;
  boundedFiles?: { path: string; maxBytes: number }[];
  onLog?: (stream: 'stdout'|'stderr'|'system', text: string) => void };
export class ProcessError extends Error {
  constructor(message: string, public canceled = false, public output = '') { super(message); }
}
export async function runCommand(options: Command): Promise<string> {
  if (options.signal?.aborted) throw new ProcessError('Canceled', true);
  return new Promise((resolve, reject) => {
    let output = '', bytes = 0, reason = '', canceled = false, settled = false;
    const child = spawn(options.executable, options.args, { cwd: options.cwd, env: options.env,
      shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const file = options.stdoutFile ? createWriteStream(options.stdoutFile, { flags: 'wx' }) : undefined;
    const terminate = (why: string, cancel = false) => {
      if (reason) return; reason = why; canceled = cancel;
      const kill = (signal: NodeJS.Signals) => { try { if (child.pid) process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); } catch {} };
      kill('SIGTERM'); escalation = setTimeout(() => kill('SIGKILL'), 1000);
    };
    let escalation: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => terminate(`Tool exceeded ${options.timeoutMs ?? 600000} ms runtime limit.`), options.timeoutMs ?? 600000);
    const abort = () => terminate('Canceled by user.', true);
    options.signal?.addEventListener('abort', abort, { once: true });
    let checking = false;
    const fileMonitor = options.boundedFiles?.length ? setInterval(async () => {
      if(checking) return; checking=true;
      try { for(const limit of options.boundedFiles ?? []) {
        const size=(await stat(limit.path).catch(()=>undefined))?.size ?? 0;
        if(size>limit.maxBytes) terminate(`Waveform output exceeded ${limit.maxBytes} bytes. Shorten the testbench.`);
      } } finally { checking=false; }
    },50):undefined;
    file?.on('error', e => terminate(`Cannot write output: ${e.message}`));
    for (const [stream, pipe] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) {
      pipe.on('data', (data: Buffer) => {
        bytes += data.length;
        if (bytes > (options.maxOutputBytes ?? 16 * 1024 * 1024)) { terminate('Tool exceeded the output limit.'); return; }
        if (file && stream === 'stdout') { if (!file.write(data)) { pipe.pause(); file.once('drain', () => pipe.resume()); } }
        else { const text = data.toString('utf8'); output += text; options.onLog?.(stream, text); }
      });
    }
    const finish = (error?: Error) => {
      if (settled) return; settled = true;
      clearTimeout(timer); if (escalation) clearTimeout(escalation); if(fileMonitor) clearInterval(fileMonitor); options.signal?.removeEventListener('abort', abort);
      const done = () => error ? reject(error) : resolve(output);
      if (file) file.end(done); else done();
    };
    child.once('error', e => finish(new ProcessError(`Cannot launch ${options.executable}: ${e.message}`, false, output)));
    child.once('close', (code, signal) => finish(reason || code !== 0
      ? new ProcessError(reason || `Tool exited ${code ?? signal}.`, canceled, output) : undefined));
  });
}
