import { normalizeOpenApi } from './openapi-normalizer';
import { normalizePostman } from './postman-normalizer';
import { normalizeGraphQLSDL, normalizeGraphQLIntrospection } from './graphql-normalizer';
import { generateTypesFile } from './ts-types';
import { generateValidatorFiles } from './zod-schemas';
import { generateServiceFiles } from './services';
import { generateHookFiles, generateQueryKeysFile } from './hooks';
import { generateMockDataFile, generateMockHandlersFile } from './mocks';
import { generateReadme } from './docs';
import { generateClientFile, generateAuthFile, generateErrorFile, generateValidateFile } from './infra';
import type { GeneratedFile } from '../types';
import type { NormalizedSpec } from './model';

export type TemplateSourceFormat = 'openapi' | 'postman' | 'graphql-sdl' | 'graphql-introspection';

export const NORMALIZERS: Record<TemplateSourceFormat, (rawContent: string, baseUrlOverride?: string) => NormalizedSpec> = {
  openapi: normalizeOpenApi,
  postman: normalizePostman,
  'graphql-sdl': normalizeGraphQLSDL,
  'graphql-introspection': normalizeGraphQLIntrospection,
};

export interface TemplateGenerationResult {
  files: GeneratedFile[];
  warnings: string[];
}

/**
 * Deterministic OpenAPI/Swagger/Postman/GraphQL → TypeScript integration codegen.
 * No AI, no network calls, no API key — same spec always produces the same output.
 */
export function generateTemplateFiles(
  rawContent: string,
  format: TemplateSourceFormat,
  baseUrlOverride?: string
): TemplateGenerationResult {
  const spec = NORMALIZERS[format](rawContent, baseUrlOverride);
  const warnings = spec.warnings ?? [];

  const codeFiles: GeneratedFile[] = [
    generateErrorFile(),
    generateAuthFile(spec),
    generateValidateFile(),
    generateClientFile(spec),
    generateQueryKeysFile(spec),
    { path: 'types/index.ts', content: generateTypesFile(spec) },
    ...generateValidatorFiles(spec),
    ...generateServiceFiles(spec),
    ...generateHookFiles(spec),
    generateMockDataFile(spec),
    generateMockHandlersFile(spec),
  ];

  const files: GeneratedFile[] = [
    ...codeFiles,
    generateReadme(spec, codeFiles.map((f) => f.path)),
  ];

  return { files, warnings };
}
