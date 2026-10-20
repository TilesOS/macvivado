import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { projectSchema, relativeFile, type ProjectInfo } from '../shared/types';

const excluded = new Set(['.macvivado', '.git', 'node_modules', '.DS_Store']);
export async function projectPath(root: string, relative: string, mustExist = true): Promise<string> {
  relativeFile.parse(relative);
  if (relative.split('/').some(p => excluded.has(p))) throw new Error('That path is reserved by MacVivado.');
  const base = await fs.realpath(root);
  const target = path.resolve(base, relative);
  const resolved = mustExist ? await fs.realpath(target) : path.join(await fs.realpath(path.dirname(target)), path.basename(target));
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw new Error('File escapes the project directory.');
  // Reject symlinks even if they currently resolve inside the project; snapshots stay ordinary files.
  let cursor = base;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    const stat = await fs.lstat(cursor).catch(() => undefined);
    if (stat?.isSymbolicLink()) throw new Error('Symlinks are not supported in project inputs.');
  }
  return resolved;
}
export async function projectFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(path.join(root, dir), { withFileTypes: true })) {
      if (excluded.has(entry.name) || entry.name.startsWith('.')) continue;
      const relative = path.posix.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink is not a portable input: ${relative}`);
      if (entry.isDirectory()) await walk(relative);
      else if (entry.isFile()) files.push(relative);
      if (files.length > 4096) throw new Error('Project exceeds 4096 input files.');
    }
  }
  await walk('');
  return files.sort();
}
export async function loadProject(root: string): Promise<ProjectInfo> {
  root = await fs.realpath(root);
  const filename = await projectPath(root, 'macvivado.json');
  const config = projectSchema.parse(JSON.parse(await fs.readFile(filename, 'utf8')));
  for (const f of [...config.sources, ...config.constraints, ...config.simulation.sources]) {
    if (!(await fs.stat(await projectPath(root, f))).isFile()) throw new Error(`Not a file: ${f}`);
  }
  for (const f of config.includeDirectories) {
    if (!(await fs.stat(await projectPath(root, f))).isDirectory()) throw new Error(`Not an include directory: ${f}`);
  }
  return { root, config, files: await projectFiles(root) };
}
export async function inputSnapshot(root: string, toolchain: string, output?: string) {
  const project = await loadProject(root);
  const hash = createHash('sha256').update(toolchain);
  let capturedConfig = project.config;
  let total = 0;
  for (const file of project.files) {
    const input = await projectPath(root, file);
    const stat = await fs.stat(input);
    if (stat.size > 16 * 1024 * 1024 || (total += stat.size) > 64 * 1024 * 1024) throw new Error('Project inputs exceed 64 MiB, or one file exceeds 16 MiB.');
    const data = await fs.readFile(input);
    if(file === 'macvivado.json') capturedConfig = projectSchema.parse(JSON.parse(data.toString('utf8')));
    hash.update(file).update('\0').update(String(data.length)).update('\0').update(data);
    if (output) { await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true }); await fs.writeFile(path.join(output, file), data); }
  }
  return { project: { ...project, config: capturedConfig }, fingerprint: hash.digest('hex') };
}
export async function fileSha256(filename: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
export async function atomicJson(filename: string, data: unknown) {
  const temp = filename + '.tmp'; await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n'); await fs.rename(temp, filename);
}
