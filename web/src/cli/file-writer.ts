import * as fs from 'fs-extra';
import * as path from 'path';
import { logger } from './logger';

export async function writeGeneratedFiles(
  files: Array<{ path: string; content: string }>,
  outputDir: string
): Promise<void> {
  await fs.ensureDir(outputDir);

  for (const file of files) {
    const fullPath = path.join(outputDir, file.path);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, file.content, 'utf-8');
    logger.dim(`  written: ${file.path}`);
  }
}
