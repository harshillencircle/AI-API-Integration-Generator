import type { GeneratedFile } from '../core/types';

export type { GeneratedFile };

export interface GenerationOptions {
  input: string;
  output: string;
  baseUrl?: string;
}

export interface GenerationResult {
  files: GeneratedFile[];
  outputDir: string;
  duration: number;
}
