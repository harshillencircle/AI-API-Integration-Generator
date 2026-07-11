import * as fs from 'fs-extra';
import * as path from 'path';
import { parseSpecContent } from '../core/spec';
import type { SpecInfo } from '../core/spec';

export async function loadSpec(input: string): Promise<SpecInfo> {
  let content: string;
  let filename: string;

  if (input.startsWith('http://') || input.startsWith('https://')) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
    }
    content = await response.text();
    const urlPath = new URL(input).pathname;
    filename = urlPath.split('/').pop() || 'spec';
  } else {
    const resolvedPath = path.resolve(input);
    if (!(await fs.pathExists(resolvedPath))) {
      throw new Error(`File not found: ${resolvedPath}`);
    }
    content = await fs.readFile(resolvedPath, 'utf-8');
    filename = path.basename(input);
  }

  return parseSpecContent(content, filename);
}
