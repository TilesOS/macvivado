import { runCommand, type Command } from './runner';
import type { Toolchain, Log } from './toolchain';
import type { Device, TargetState } from '../shared/types';

const plain = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
export function parseUsbScan(output: string): Device[] {
  const lines = plain(output).split(/\r?\n/), header = lines.find(s => /^Bus\s+device\s+vid:pid/.test(s));
  if (!header) throw new Error('Unrecognized openFPGALoader USB scan output.');
  const vidStart = header.indexOf('vid:pid'), probeStart = header.indexOf('probe_type');
  const makerStart = header.indexOf('manufacturer'), serialStart = header.indexOf('serial'), productStart = header.indexOf('product');
  const devices: Device[] = [];
  for (const line of lines) {
    if (!/^\d+\s+\d+\s/.test(line)) continue;
    const match = line.slice(vidStart,probeStart).trim().match(/^(?:0x)?([\da-f]{4}):(?:0x)?([\da-f]{4})$/i);
    if (!match) throw new Error('Unrecognized USB identity format.');
    // Nexys A7 uses the Digilent FT2232 cable. FPGA ID is separately checked through JTAG.
    if (match[1].toLowerCase() !== '0403' || match[2].toLowerCase() !== '6010') continue;
    const manufacturer = line.slice(makerStart,serialStart).trim();
    const serial = line.slice(serialStart,productStart).trim();
    if (!/digilent/i.test(manufacturer) || !/^[A-Za-z0-9_-]{1,80}$/.test(serial) || serial === 'none') continue;
    if (devices.some(d => d.serial === serial)) throw new Error('Duplicate USB serial numbers; select a uniquely identified cable.');
    devices.push({ serial, vid: match[1].toLowerCase(), pid: match[2].toLowerCase(), description: line.slice(productStart).trim() || 'Digilent FT2232' });
  }
  return devices;
}
export function verifyIdentity(output: string): string {
  const clean = plain(output);
  const ids = [...clean.matchAll(/^\s*idcode\s+(?:0x)?([0-9a-f]+)\s*$/gim)].map(m => Number.parseInt(m[1],16) & 0x0fffffff);
  if (ids.length !== 1 || ids[0] !== 0x03631093 || !/model\s+xc7a100\b/i.test(clean)) throw new Error('Target mismatch: expected one XC7A100T with IDCODE 0x03631093.');
  return 'XC7A100T · IDCODE 0x03631093';
}
// The dependency injection point exists only in this module’s tests. Preload exposes no fixture path.
export class Programmer {
  constructor(private tools: Toolchain, private execute: (command: Command) => Promise<string> = runCommand) {}
  private async command(args: string[], signal?: AbortSignal, log?: Log) {
    return this.execute({ executable: this.tools.tool('openFPGALoader'), args, cwd: this.tools.root,
      env: this.tools.env, signal, timeoutMs: 15000, maxOutputBytes: 1024*1024, onLog: log });
  }
  async scan(selected?: string, signal?: AbortSignal, log?: Log): Promise<TargetState> {
    const checkedAt = new Date().toISOString();
    try {
      const devices = parseUsbScan(await this.command(['--scan-usb'], signal, log));
      if (!devices.length) return { state: 'disconnected', devices, verified: false, checkedAt, message: 'No compatible Digilent cable detected. Editing, simulation, and builds are available.' };
      if (selected && !devices.some(d => d.serial === selected)) return { state: 'disconnected', devices, verified: false, checkedAt, message: 'Selected cable disconnected. Select a detected device.' };
      const serial = selected ?? (devices.length === 1 ? devices[0].serial : undefined);
      if (!serial) return { state: 'unknown', devices, verified: false, checkedAt, message: 'Multiple cables detected. Select the target by USB serial.' };
      const identity = verifyIdentity(await this.command(['--board','nexys_a7_100','--usb-serial-num',serial,'--detect'],signal,log));
      return { state: 'connected', devices, selected: serial, verified: true, identity, checkedAt, message: `Detected ${identity}. Physical example verification is recorded separately.` };
    } catch (e) { return { state: 'error', devices: [], verified: false, checkedAt, message: `Detection failed: ${(e as Error).message}` }; }
  }
  async program(serial: string, bitstream: string, signal: AbortSignal, log: Log, validate: () => Promise<void>) {
    const target = await this.scan(serial,signal,log);
    if (!target.verified || target.selected !== serial) throw new Error(target.message);
    await validate(); // Recheck fingerprints and bitstream after the live target check.
    await this.command(['--board','nexys_a7_100','--usb-serial-num',serial,'--write-sram',bitstream],signal,log);
    // A successful process alone is insufficient if the device disappears immediately afterwards.
    const after = await this.scan(serial,signal,log);
    if (!after.verified) throw new Error(`Programming could not be confirmed: ${after.message}`);
    return after;
  }
}
