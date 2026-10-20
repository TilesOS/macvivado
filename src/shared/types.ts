import { z } from 'zod';

export const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_$]*$/);
export const relativeFile = z.string().min(1).max(512).refine(p =>
  !p.startsWith('/') && !p.split(/[\\/]/).includes('..') && !/[\x00-\x1f\\";]/.test(p), 'Use a relative project path without traversal or control characters');
export const projectSchema = z.object({
  version: z.literal(1), name: z.string().min(1).max(100),
  board: z.literal('nexys-a7-100t'), top: identifier,
  sources: z.array(relativeFile).min(1).max(256),
  includeDirectories: z.array(relativeFile).max(64).default([]),
  defines: z.record(identifier, z.string().regex(/^[A-Za-z0-9_'hHbBdDoOxXzZ.+-]*$/)).default({}),
  constraints: z.array(relativeFile).min(1).max(32),
  simulation: z.object({ sources: z.array(relativeFile).min(1).max(256), top: identifier,
    timeoutMs: z.number().int().min(100).max(60000).default(10000) }).strict()
}).strict();
export type Project = z.infer<typeof projectSchema>;
export type Diagnostic = { file?: string; line?: number; column?: number; severity: 'error'|'warning'; message: string };
export type ProjectInfo = { root: string; config: Project; files: string[] };
export type Action = 'simulate'|'build'|'program'|'install';
export type JobStatus = 'running'|'success'|'failed'|'canceled'|'stale';
export type RunRecord = { id: string; action: Action; status: JobStatus; startedAt: string; finishedAt?: string;
  directory: string; fingerprint: string; toolchain: string; diagnostics: Diagnostic[]; message?: string;
  bitstream?: string; bitstreamSha256?: string; waveform?: Waveform; stages: string[] };
export type WaveSignal = { id: string; name: string; width: number; changes: [number,string][] };
export type Waveform = { timescale: string; endTime: number; signals: WaveSignal[]; truncated: boolean };
export type Device = { serial: string; description: string; vid: string; pid: string };
export type TargetState = { state: 'unknown'|'disconnected'|'connected'|'error'; devices: Device[]; selected?: string;
  identity?: string; verified: boolean; message: string; checkedAt?: string };
export type ToolState = { installed: boolean; id: string; root: string; message: string };
export type AppState = { project?: ProjectInfo; tools: ToolState; target: TargetState; activeJob?: RunRecord;
  builds: RunRecord[]; ready?: RunRecord; busy: boolean };
export type AppEvent = { type: 'state'; state: AppState } | { type: 'log'; jobId: string; stream: 'stdout'|'stderr'|'system'; text: string }
  | { type: 'command'; command: 'open'|'save'|'saveAll'|'simulate'|'build'|'program'|'closeTab'|'toggleSidebar' };
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface API {
  state(): Promise<AppState>;
  openProject(): Promise<ProjectInfo|undefined>;
  createExample(example: string): Promise<ProjectInfo|undefined>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  createFile(path: string): Promise<void>;
  run(action: 'simulate'|'build'): Promise<void>;
  cancel(): Promise<void>;
  installTools(): Promise<void>;
  scanDevices(): Promise<void>;
  selectDevice(serial: string): Promise<void>;
  program(): Promise<void>;
  revealArtifacts(id: string): Promise<void>;
  readRun(id: string): Promise<{record: RunRecord; log: string}>;
  onEvent(listener: (event: AppEvent) => void): () => void;
}
declare global { interface Window { macvivado: API } }
