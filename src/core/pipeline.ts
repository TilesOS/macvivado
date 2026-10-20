import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inputSnapshot, fileSha256, atomicJson } from './project';
import { runCommand, ProcessError } from './runner';
import { Toolchain, type Log } from './toolchain';
import { validateConstraints, type Port } from './constraints';
import { parseDiagnostics } from './diagnostics';
import { parseVcd } from './vcd';
import type { Diagnostic, RunRecord } from '../shared/types';

const part = 'xc7a100tcsg324-1';
// Yosys scripts are a separate command language: only JSON-quoted validated paths enter them.
const quote = (s: string) => JSON.stringify(s);
export class Pipeline {
  constructor(public tools: Toolchain, public log: Log) {}
  async run(root: string, action: 'build'|'simulate', signal: AbortSignal, onUpdate?: (record: RunRecord) => void): Promise<RunRecord> {
    const id = `${Date.now()}-${randomUUID().slice(0,8)}`;
    const directory = path.join(root, '.macvivado', action === 'build' ? 'builds' : 'simulations', id);
    await fs.mkdir(directory, { recursive: true });
    const record: RunRecord = { id, action, directory, status: 'running', startedAt: new Date().toISOString(),
      fingerprint: '', toolchain: this.tools.id, diagnostics: [], stages: [] };
    const logFile = path.join(directory, 'run.log');
    let pendingLog = Promise.resolve();
    const log: Log = (stream, text) => { this.log(stream,text); pendingLog = pendingLog.then(() => fs.appendFile(logFile, text)); };
    const checkpoint = async () => { await atomicJson(path.join(directory,'run.json'), record); onUpdate?.({ ...record }); };
    await checkpoint();
    try {
      const toolState = await this.tools.verify(); if (!toolState.installed) throw new Error(toolState.message);
      if (signal.aborted) throw new ProcessError('Canceled',true);
      const input = path.join(directory, 'input');
      const snapshot = await inputSnapshot(root, this.tools.id, input);
      record.fingerprint = snapshot.fingerprint;
      const { config } = snapshot.project;
      const stage = async (name: string, executable: string, args: string[], timeoutMs = 600000) => {
        if (signal.aborted) throw new ProcessError('Canceled',true);
        record.stages.push(name); await checkpoint(); log('system', `\n── ${name} ──\n${path.basename(executable)} ${args.map(a => JSON.stringify(a)).join(' ')}\n`);
        try {
          const output = await runCommand({ executable, args, cwd: input, env: this.tools.env, signal, timeoutMs, onLog: log,
            boundedFiles: action==='simulate' ? [{path:path.join(input,'wave.vcd'),maxBytes:16*1024*1024}]:undefined });
          record.diagnostics.push(...parseDiagnostics(output)); return output;
        } catch (e) { if (e instanceof ProcessError) record.diagnostics.push(...parseDiagnostics(e.output)); throw e; }
      };
      if (action === 'simulate') {
        // Icarus constructs internal shell commands without quoting its support-directory prefix.
        // A relative alias keeps the official bundle usable under macOS's "Application Support".
        await fs.symlink(path.join(this.tools.oss,'lib','ivl'),path.join(directory,'iverilog-support'),'dir');
        const options = [...config.includeDirectories.flatMap(d => ['-I', d]), ...Object.entries(config.defines).map(([k,v]) => `-D${k}${v ? '='+v : ''}`)];
        await stage('Compile simulation',this.tools.tool('iverilog'),['-B','../iverilog-support','-g2012','-Wall','-s',config.simulation.top,'-o',path.join(directory,'simulation.vvp'),...options,...new Set([...config.sources,...config.simulation.sources])],30000);
        await stage('Run testbench',this.tools.tool('vvp'),[path.join(directory,'simulation.vvp')],config.simulation.timeoutMs);
        const vcd = path.join(input,'wave.vcd');
        if ((await fs.stat(vcd)).size > 16*1024*1024) throw new Error('VCD exceeds 16 MiB. Shorten the testbench.');
        record.waveform = parseVcd(await fs.readFile(vcd,'utf8'));
        await fs.copyFile(vcd,path.join(directory,'wave.vcd'));
      } else {
        const constraints = await Promise.all(config.constraints.map(async file => ({ file, text: await fs.readFile(path.join(input,file),'utf8') })));
        const check = (ports?: Record<string,Port>) => {
          const result = validateConstraints(constraints, ports);
          record.diagnostics.push(...result.diagnostics);
          if (result.diagnostics.some(d => d.severity === 'error')) throw new Error('Constraint validation failed. See Problems for file and line.');
          return result;
        };
        check();
        // Yosys unquotes source filenames but does not unquote -I option values.
        // Copy snapshot includes to relative, space-free aliases within this run.
        const includeAliases: string[] = [];
        for(const [index, include] of config.includeDirectories.entries()) {
          const destination=path.join(directory,'includes',String(index));
          await fs.cp(path.join(input,include),destination,{recursive:true});
          includeAliases.push(`-I../includes/${index}`);
        }
        const options = [...includeAliases,...Object.entries(config.defines).map(([k,v]) => `-D${k}${v ? '='+v : ''}`)];
        const script = [`read_verilog -sv ${options.join(' ')} ${config.sources.map(quote).join(' ')}`,`synth_xilinx -flatten -abc9 -arch xc7 -top ${config.top}`,`write_json ${quote(path.join(directory,'design.json'))}`].join('\n') + '\n';
        const scriptPath = path.join(directory,'synthesis.ys'); await fs.writeFile(scriptPath,script);
        await stage('Synthesize · Yosys',this.tools.tool('yosys'),['-Q','-s',scriptPath]);
        const netlist = JSON.parse(await fs.readFile(path.join(directory,'design.json'),'utf8'));
        const ports = netlist.modules[config.top]?.ports as Record<string,Port>|undefined;
        if (!ports) throw new Error('Synthesis did not produce the selected top module.');
        const validated = check(ports);
        const xdc = path.join(directory,'validated.xdc');
        // Canonicalize our supported subset; unsupported Tcl never reaches nextpnr.
        await fs.writeFile(xdc, validated.pins.map(p => `set_property -dict { PACKAGE_PIN ${p.pin} IOSTANDARD ${p.standard} } [get_ports {${p.port}}]`).concat(validated.clocks.map(c => `create_clock -period ${c.period} [get_ports {${c.port}}]`)).join('\n')+'\n');
        const fasm = path.join(directory,'design.fasm'), frames = path.join(directory,'design.frames'), bitstream = path.join(directory,'design.bit');
        await stage('Place & route · nextpnr',this.tools.tool('nextpnr-himbaechel'),['--device',part,'--chipdb',`${this.tools.xc7}/share/chipdb-xc7a100t.bin`,'--json',path.join(directory,'design.json'),'-o',`xdc=${xdc}`,'-o',`fasm=${fasm}`,'--freq','100','--seed','1']);
        await stage('Convert FASM · Project X-Ray',this.tools.tool('tabbypy3'),[`${this.tools.xc7}/python/fasm2frames.py`,'--db-root',`${this.tools.xc7}/share/artix7`,'--part',part,fasm,frames]);
        await stage('Generate bitstream · Project X-Ray',this.tools.tool('xc7frames2bit'),['--part_file',`${this.tools.xc7}/share/artix7/${part}/part.yaml`,'--part_name',part,'--frm_file',frames,'--output_file',bitstream]);
        const bit = await fs.readFile(bitstream);
        if (bit.length < 100000 || !bit.includes(Buffer.from([0xaa,0x99,0x55,0x66]))) throw new Error('Generated file is not a valid Xilinx bitstream.');
        record.bitstream = bitstream; record.bitstreamSha256 = await fileSha256(bitstream);
      }
      if (signal.aborted) throw new ProcessError('Canceled',true);
      record.status = (await inputSnapshot(root,this.tools.id)).fingerprint === record.fingerprint ? 'success' : 'stale';
      record.message = record.status === 'stale' ? 'Inputs changed during the run. Run again before programming.' : action === 'build' ? 'Bitstream generated. Physical hardware verification pending.' : 'Simulation completed; VCD captured.';
    } catch (e) {
      record.status = signal.aborted || (e instanceof ProcessError && e.canceled) ? 'canceled' : 'failed';
      record.message = (e as Error).message;
      if (!record.diagnostics.some(d => d.severity === 'error') && record.status !== 'canceled') record.diagnostics.push({ severity: 'error', message: record.message });
      log('system', `\n${record.status.toUpperCase()}: ${record.message}\n`);
      delete record.bitstream; delete record.bitstreamSha256;
    }
    record.finishedAt = new Date().toISOString();
    await pendingLog; await checkpoint(); return record;
  }
}
export async function assertProgrammable(root: string, record: RunRecord|undefined, tools: Toolchain) {
  if (!record || record.action !== 'build' || record.status !== 'success' || !record.bitstream || !record.bitstreamSha256) throw new Error('A successful current build is required.');
  if (record.toolchain !== tools.id || (await inputSnapshot(root, tools.id)).fingerprint !== record.fingerprint) throw new Error('Build is stale. Build the current project before programming.');
  if (await fileSha256(record.bitstream) !== record.bitstreamSha256) throw new Error('Bitstream checksum changed. Rebuild before programming.');
  const verified = await tools.verify(); if (!verified.installed) throw new Error(verified.message);
  return record.bitstream;
}
