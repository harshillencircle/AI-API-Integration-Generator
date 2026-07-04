import chalk from 'chalk';
import * as path from 'path';
import { loadSpec, formatDisplayName } from '../parsers/index';
import { writeGeneratedFiles } from '../writers/file-writer';
import { generateTemplateFiles } from './template/index';
import { logger } from '../utils/logger';
import type { GenerationOptions, GenerationResult } from '../types';

export async function generateIntegration(options: GenerationOptions): Promise<GenerationResult> {
  const startTime = Date.now();

  logger.step(1, `Loading spec: ${chalk.cyan(options.input)}`);
  const rawSpec = await loadSpec(options.input);
  logger.success(`Format detected: ${chalk.bold(formatDisplayName(rawSpec.format))}`);

  logger.step(2, 'Generating integration (template-based, no AI)...');
  const files = generateTemplateFiles(rawSpec.content, options.baseUrl);
  logger.success(`Generated ${files.length} files`);

  logger.step(3, `Writing to: ${chalk.cyan(options.output)}`);
  await writeGeneratedFiles(files, options.output);

  return {
    files,
    outputDir: path.resolve(options.output),
    duration: Date.now() - startTime,
  };
}
