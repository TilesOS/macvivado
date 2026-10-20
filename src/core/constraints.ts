import board from '../../resources/boards/nexys-a7-100t.json';
import type { Diagnostic } from '../shared/types';

export type Port = { direction: string; bits: unknown[]; offset?: number; upto?: number };
export type PinAssignment = { port: string; pin: string; standard: string };
export function validateConstraints(files: { file: string; text: string }[], ports?: Record<string,Port>) {
  const diagnostics: Diagnostic[] = [], assignments = new Map<string, Record<string,string>>();
  const locations = new Map<string, { file: string; line: number }>();
  const clocks: { port: string; period: number; file: string; line: number }[] = [];
  const allowed = new Map(Object.values(board.pins).map(p => [p.pin, p.standard]));
  const error = (file: string, line: number, message: string) => diagnostics.push({ file, line, severity: 'error', message });
  for (const { file, text } of files) {
    text.split(/\r?\n/).forEach((raw, index) => {
      const line = index + 1;
      const clean = raw.replace(/#.*$/, '').trim();
      for (const command of clean.split(';').map(s => s.trim()).filter(Boolean)) {
        const match = command.match(/^(.*?)\s+\[get_ports\s+(?:\{\s*([^}]+?)\s*\}|([A-Za-z_][\w$]*(?:\[\d+\])?))\s*\]$/);
        if (!match) { error(file, line, 'Unsupported XDC. Use set_property or create_clock with one explicit get_ports target.'); continue; }
        const [, prefix, braced, bare] = match; const port = braced ?? bare;
        if (!/^[A-Za-z_][\w$]*(?:\[\d+\])?$/.test(port)) { error(file, line, 'Wildcards, Tcl substitutions, and multi-port targets are unsupported.'); continue; }
        if (prefix.startsWith('set_property ')) {
          let pairs: string[];
          const dict = prefix.match(/^set_property\s+-dict\s+\{\s*([^}]+)\s*\}$/);
          if (dict) pairs = dict[1].trim().split(/\s+/);
          else { const simple = prefix.match(/^set_property\s+(\w+)\s+(\w+)$/); pairs = simple ? simple.slice(1) : []; }
          if (!pairs.length || pairs.length % 2) { error(file, line, 'Expected property/value pairs.'); continue; }
          const props = assignments.get(port) ?? {};
          locations.set(port, { file, line });
          for (let i = 0; i < pairs.length; i += 2) {
            const [key, value] = pairs.slice(i, i + 2);
            if (!['PACKAGE_PIN','IOSTANDARD'].includes(key)) error(file, line, `Unsupported property ${key}. Only PACKAGE_PIN and IOSTANDARD are supported.`);
            else if (props[key] && props[key] !== value) error(file, line, `Conflicting ${key} on ${port}.`);
            else props[key] = value;
          }
          assignments.set(port, props);
        } else if (prefix.startsWith('create_clock ')) {
          const options = prefix.replace(/^create_clock\s+/, '');
          const period = options.match(/(?:^|\s)-period\s+([\d.]+)(?=\s|$)/);
          const rest = options.replace(/-period\s+[\d.]+/, '').replace(/-add\b/, '').replace(/-name\s+[A-Za-z_][\w$]*/, '').replace(/-waveform\s+\{\s*0(?:\.0*)?\s+5(?:\.0*)?\s*\}/, '').trim();
          if (!period || rest || !Number.isFinite(Number(period[1])) || Number(period[1]) <= 0) error(file, line, 'Unsupported create_clock options. Use -period 10.00 for the 100 MHz oscillator.');
          else clocks.push({ port, period: Number(period[1]), file, line });
        } else error(file, line, 'Unsupported constraint command. Timing exceptions, generated clocks, and Tcl scripts are outside this release.');
      }
    });
  }
  const pins: PinAssignment[] = [], usedPins = new Map<string,string>();
  for (const [port, props] of assignments) {
    const { file, line } = locations.get(port)!;
    const pin = props.PACKAGE_PIN, standard = props.IOSTANDARD;
    if (!pin || !standard) error(file, line, `${port} needs both PACKAGE_PIN and IOSTANDARD.`);
    else if (!allowed.has(pin)) error(file, line, `Pin ${pin} is not a supported Digilent board I/O pin.`);
    else if (allowed.get(pin) !== standard) error(file, line, `${pin} requires ${allowed.get(pin)} in the official Digilent constraints; ${standard} is unsafe.`);
    if (pin && usedPins.has(pin)) error(file, line, `Pin ${pin} is already assigned to ${usedPins.get(pin)}.`);
    if (pin) usedPins.set(pin, port);
    pins.push({ port, pin, standard });
  }
  const expanded = new Map<string,string>();
  if (ports) {
    for (const [name, p] of Object.entries(ports)) {
      if (p.bits.length === 1) { expanded.set(name, p.direction); expanded.set(`${name}[${p.offset ?? 0}]`, p.direction); }
      else for (let i = 0; i < p.bits.length; i++) expanded.set(`${name}[${i + (p.offset ?? 0)}]`, p.direction);
    }
    for (const [port] of assignments) if (!expanded.has(port)) { const l = locations.get(port)!; error(l.file, l.line, `Constraint target ${port} does not exist on the synthesized top module.`); }
    for (const [name, p] of Object.entries(ports)) {
      const targets = p.bits.length === 1 ? [name] : p.bits.map((_,i) => `${name}[${i + (p.offset ?? 0)}]`);
      for (const target of targets) if (!assignments.has(target) && !(p.bits.length === 1 && assignments.has(`${name}[${p.offset ?? 0}]`))) diagnostics.push({ severity: 'error', message: `Top-level port ${target} has no pin/voltage constraint.` });
    }
  }
  for (const c of clocks) {
    if (!assignments.has(c.port)) error(c.file, c.line, `Clock target ${c.port} has no pin assignment.`);
    if (assignments.get(c.port)?.PACKAGE_PIN !== 'E3' || c.period !== 10) error(c.file, c.line, 'The supported board clock is E3 at 100 MHz (10 ns).');
    if (ports && expanded.get(c.port) !== 'input') error(c.file, c.line, `Clock ${c.port} must target an input port.`);
  }
  if (clocks.length > 1) diagnostics.push({ severity: 'error', message: 'Only one board oscillator clock is supported.' });
  const oscillator = pins.find(p => p.pin === 'E3');
  if (oscillator && !clocks.some(c => c.port === oscillator.port)) diagnostics.push({ severity: 'error', message: 'E3 requires create_clock -period 10.00 targeting its input port.' });
  return { diagnostics, pins, clocks };
}
