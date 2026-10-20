import type { Waveform, WaveSignal } from '../shared/types';

// The producer is bounded too. Limits here defend IPC and rendering against a dense VCD.
export function parseVcd(text: string, maxChanges = 250000): Waveform {
  if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('VCD exceeds 16 MiB. Shorten the testbench.');
  const wave: Waveform = { timescale: '1 ns', endTime: 0, signals: [], truncated: false };
  const scope: string[] = [], byCode = new Map<string,WaveSignal[]>();
  let time = 0, changes = 0, inDefinitions = true;
  const timescale = text.match(/\$timescale\s+(\d+)\s*(s|ms|us|ns|ps|fs)\s*\$end/);
  if (timescale) wave.timescale = `${timescale[1]} ${timescale[2]}`;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (inDefinitions) {
      if (s.startsWith('$scope')) scope.push(s.split(/\s+/)[2]);
      else if (s.startsWith('$upscope')) scope.pop();
      else if (s.startsWith('$var')) {
        const parts = s.split(/\s+/), width = Number(parts[2]), id = parts[3];
        if (wave.signals.length >= 512) { wave.truncated = true; continue; }
        if (!Number.isInteger(width) || width < 1 || width > 4096) continue;
        const signal: WaveSignal = { id: `${id}:${wave.signals.length}`, name: [...scope, parts.slice(4, -1).join(' ')].join('.'), width, changes: [] };
        wave.signals.push(signal); byCode.set(id, [...(byCode.get(id) ?? []), signal]);
      } else if (s.startsWith('$enddefinitions')) inDefinitions = false;
      continue;
    }
    if (/^#\d+$/.test(s)) { time = Number(s.slice(1)); if (!Number.isSafeInteger(time) || time < wave.endTime) throw new Error('Invalid VCD timestamp.'); wave.endTime = time; continue; }
    let id: string, value: string;
    if (/^[01xXzZ]/.test(s)) { id = s.slice(1); value = s[0].toLowerCase(); }
    else if (/^[bB]/.test(s)) { [value, id] = s.slice(1).split(/\s+/); value = value.toLowerCase(); }
    else continue;
    for (const signal of byCode.get(id) ?? []) {
      if (++changes > maxChanges) { wave.truncated = true; break; }
      if (!/^[01xz]+$/.test(value)) continue;
      const padded = value.padStart(signal.width, /[xz]/.test(value[0]) ? value[0] : '0');
      if (signal.changes.at(-1)?.[1] !== padded) signal.changes.push([time, padded]);
    }
    if (changes > maxChanges) break;
  }
  if (inDefinitions || !wave.signals.length) throw new Error('No valid waveform signals found in VCD. Use $dumpfile("wave.vcd") and $dumpvars in the testbench.');
  return wave;
}
export function valueAt(signal: WaveSignal, time: number) {
  let low = 0, high = signal.changes.length;
  while (low < high) { const mid = (low + high) >>> 1; if (signal.changes[mid][0] <= time) low = mid + 1; else high = mid; }
  return signal.changes[low - 1]?.[1] ?? 'x'.repeat(signal.width);
}
export function formatValue(value: string, radix: 'binary'|'hex') {
  if (radix === 'binary' || /[xz]/.test(value)) return value;
  try { return BigInt('0b' + value).toString(16).toUpperCase().padStart(Math.ceil(value.length / 4), '0'); } catch { return value; }
}
