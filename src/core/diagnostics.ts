import type { Diagnostic } from '../shared/types';
export function parseDiagnostics(output: string): Diagnostic[] {
  const results: Diagnostic[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(/^FATAL:\s*/, '');
    if (/\$finish called at|:\s*(?:note|info):/i.test(line)) continue;
    let match = line.match(/^(.*?\.(?:svh?|vh?|xdc)):(\d+)(?::(\d+))?:\s*(.*)$/i);
    if (match) results.push({ file: match[1].replace(/^\.\//,''), line: Number(match[2]), column: Number(match[3] || 1), severity: /warning|^sorry:/i.test(match[4]) ? 'warning' : 'error', message: match[4] });
    else if ((match = line.match(/^(?:ERROR|Warning|WARNING):\s*(.*)$/))) results.push({ severity: /^warning/i.test(line) ? 'warning' : 'error', message: match[1] });
  }
  return results;
}
