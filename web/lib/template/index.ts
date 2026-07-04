import { normalizeOpenApi } from './openapi-normalizer';
import { normalizePostman } from './postman-normalizer';
import { normalizeGraphQLSDL, normalizeGraphQLIntrospection } from './graphql-normalizer';
import { generateTypesFile } from './ts-types';
import { generateValidatorFiles } from './zod-schemas';
import { generateServiceFiles } from './services';
import { generateHookFiles, generateQueryKeysFile } from './hooks';
import { generateMockDataFile, generateMockHandlersFile } from './mocks';
import { generateReadme } from './docs';
import { generateClientFile } from './infra';
import type { GeneratedFile } from '../types';

export type TemplateSourceFormat = 'openapi' | 'postman' | 'graphql-sdl' | 'graphql-introspection';

const NORMALIZERS: Record<TemplateSourceFormat, (rawContent: string, baseUrlOverride?: string) => ReturnType<typeof normalizeOpenApi>> = {
  openapi: normalizeOpenApi,
  postman: normalizePostman,
  'graphql-sdl': normalizeGraphQLSDL,
  'graphql-introspection': normalizeGraphQLIntrospection,
};

/**
 * Deterministic OpenAPI/Swagger/Postman/GraphQL → TypeScript integration codegen.
 * No AI, no network calls, no API key — same spec always produces the same output.
 */
export function generateTemplateFiles(
  rawContent: string,
  format: TemplateSourceFormat,
  baseUrlOverride?: string
): GeneratedFile[] {
  const spec = NORMALIZERS[format](rawContent, baseUrlOverride);

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
