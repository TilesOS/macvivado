import { z } from 'zod';
import { relativeFile } from './types';
export const requestSchema=z.discriminatedUnion('method',[
  z.object({method:z.literal('state')}).strict(),
  z.object({method:z.literal('openProject')}).strict(),
  z.object({method:z.literal('createExample'),example:z.enum(['blink','switch-to-led','seven-segment'])}).strict(),
  z.object({method:z.literal('readFile'),path:relativeFile}).strict(),
  z.object({method:z.literal('writeFile'),path:relativeFile,content:z.string().max(2*1024*1024)}).strict(),
  z.object({method:z.literal('createFile'),path:relativeFile}).strict(),
  z.object({method:z.literal('run'),action:z.enum(['build','simulate'])}).strict(),
  z.object({method:z.literal('cancel')}).strict(),
  z.object({method:z.literal('installTools')}).strict(),
  z.object({method:z.literal('scanDevices')}).strict(),
  z.object({method:z.literal('selectDevice'),serial:z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)}).strict(),
  z.object({method:z.literal('program')}).strict(),
  z.object({method:z.literal('revealArtifacts'),id:z.string().regex(/^[0-9a-f-]+$/)}).strict(),
  z.object({method:z.literal('readRun'),id:z.string().regex(/^[0-9a-f-]+$/)}).strict()
]);
export type Request=z.infer<typeof requestSchema>;
