import { normalizeOpenApi } from './openapi-normalizer';
import { generateTypesFile } from './ts-types';
import { generateValidatorFiles } from './zod-schemas';
import { generateServiceFiles } from './services';
import { generateHookFiles, generateQueryKeysFile } from './hooks';
import { generateMockDataFile, generateMockHandlersFile } from './mocks';
import { generateReadme } from './docs';
import { generateClientFile } from './infra';
import type { GeneratedFile } from '../../types';

/**
 * Deterministic OpenAPI/Swagger → TypeScript integration codegen.
 * No AI, no network calls, no API key — same spec always produces the same output.
 */
export function generateTemplateFiles(rawContent: string, baseUrlOverride?: string): GeneratedFile[] {
  const spec = normalizeOpenApi(rawContent, baseUrlOverride);

  return [
    generateClientFile(spec),
    generateQueryKeysFile(spec),
    { path: 'types/index.ts', content: generateTypesFile(spec) },
    ...generateValidatorFiles(spec),
    ...generateServiceFiles(spec),
    ...generateHookFiles(spec),
    generateMockDataFile(spec),
    generateMockHandlersFile(spec),
    generateReadme(spec),
  ];
}
