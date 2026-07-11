import type { GeneratedFile } from '../core/types';
import type { ChangeReport } from '../core/diff';

export type { GeneratedFile };

export interface GenerateRequest {
  specContent?: string;
  specUrl?: string;
  filename?: string;
  baseUrl?: string;
}

export interface GenerateResponse {
  files: GeneratedFile[];
  duration: number;
  warnings: string[];
}

export interface DiffRequest {
  oldSpecContent: string;
  newSpecContent: string;
  baseUrl?: string;
}

export interface DiffResponse extends ChangeReport {
  duration: number;
}
