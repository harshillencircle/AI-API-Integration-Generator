import chalk from 'chalk';
import * as path from 'path';
import { loadSpec } from './spec-loader';
import { formatDisplayName } from '../core/spec';
import { writeGeneratedFiles } from './file-writer';
import { generateTemplateFiles } from '../core/template/index';
import { logger } from './logger';
import type { GenerationOptions, GenerationResult } from './types';

export async function generateIntegration(options: GenerationOptions): Promise<GenerationResult> {
  const startTime = Date.now();

  logger.step(1, `Loading spec: ${chalk.cyan(options.input)}`);
  const rawSpec = await loadSpec(options.input);
  logger.success(`Format detected: ${chalk.bold(formatDisplayName(rawSpec.format))}`);

  if (rawSpec.format === 'unknown') {
    throw new Error(
      'Could not detect the spec format. Supported: OpenAPI/Swagger, Postman Collection, GraphQL SDL, GraphQL introspection JSON.'
    );
  }

  logger.step(2, 'Generating integration (template-based, no AI)...');
  const files = generateTemplateFiles(rawSpec.content, rawSpec.format, options.baseUrl);
  logger.success(`Generated ${files.length} files`);

  logger.step(3, `Writing to: ${chalk.cyan(options.output)}`);
  await writeGeneratedFiles(files, options.output);

  return {
    files,
    outputDir: path.resolve(options.output),
    duration: Date.now() - startTime,
  };
}
