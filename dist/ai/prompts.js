"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSystemPrompt = buildSystemPrompt;
exports.buildGenerationPrompt = buildGenerationPrompt;
exports.buildChunk1Prompt = buildChunk1Prompt;
exports.buildChunk2Prompt = buildChunk2Prompt;
exports.buildChunk3Prompt = buildChunk3Prompt;
exports.buildSingleResourcePrompt = buildSingleResourcePrompt;
exports.parseGeneratedFiles = parseGeneratedFiles;
exports.extractServiceSignatures = extractServiceSignatures;
// ── Shared output format rules ────────────────────────────────────────────────
const FORMAT_RULES = `
OUTPUT FORMAT — wrap every file in this EXACT tag (no markdown, no prose):
<generated-file path="path/to/file.ts">
// file content
</generated-file>

REQUIRED PATHS (use EXACTLY — no "src/" prefix):
  types/index.ts                    ← all TypeScript interfaces
  validators/{resource}.schema.ts   ← Zod schemas per resource tag
  services/{resource}.service.ts    ← Axios service class per resource tag
  hooks/{resource}/index.ts         ← React Query hooks per resource tag
  mocks/handlers.ts                 ← MSW request handlers
  mocks/data.ts                     ← Faker-style data factories
  docs/README.md                    ← setup + usage docs

IMPORTS: relative paths, no .ts extension, no "src/" prefix
  services import from: ../../api/client, ../../types/index
  hooks import from: @tanstack/react-query, ../index (service), ../../api/queryKeys`.trim();
// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
    return `You are a TypeScript expert generating production-ready Next.js API integration code.
Rules:
- Strict TypeScript, zero "any" (use unknown where type is unclear)
- Zod v3 schemas, Axios HTTP client, React Query v5 (TanStack) hooks
- Complete files only — no TODOs, no placeholders, no ellipsis
- React Query v5: use object syntax { queryKey: [...], queryFn: () => ... }
- useMutation v5: useMutation({ mutationFn: ..., onSuccess: ... })
- No React import needed in hook files
${FORMAT_RULES}`;
}
// ── Single-call prompt (Anthropic — paid) ─────────────────────────────────────
function buildGenerationPrompt(spec, baseUrl) {
    return `Generate a complete TypeScript API integration from this API specification.
Base URL: ${baseUrl ?? 'use value from spec'}

<api_specification>
${spec.content}
</api_specification>

Generate ALL files for EVERY resource/tag in the spec:
1. types/index.ts — TypeScript interfaces for every model. JSDoc each field.
2. validators/{resource}.schema.ts — Zod v3 schemas, one per resource. import { z } from "zod".
3. services/{resource}.service.ts — Static service class. One async method per endpoint. Use ../../api/client (default export) and ../../types/index.
4. hooks/{resource}/index.ts — React Query v5 hooks. Key factory object. useQuery for GETs (enabled: !!id for detail). useMutation for writes with cache invalidation.
5. mocks/handlers.ts — MSW v2 handlers. import { http, HttpResponse } from "msw".
6. mocks/data.ts — Factory functions returning realistic test data.
7. docs/README.md — Setup, env vars, QueryClientProvider snippet, one usage example per resource.

${FORMAT_RULES}`;
}
// ── Chunk 1: types + validators (free providers, pass 1/3) ────────────────────
function buildChunk1Prompt(spec, baseUrl) {
    return `Generate TypeScript types and Zod validators from this API spec.
${baseUrl ? `Base URL: ${baseUrl}` : ''}

<spec>
${spec.content}
</spec>

Generate ONLY:
1. types/index.ts — one TypeScript interface per model/schema.
   - Export everything. JSDoc key fields.
   - Union types for enums (e.g. type Status = 'active' | 'inactive').
   - Generic pagination: export interface PaginatedResponse<T> { data: T[]; total: number; page: number; limit: number; }
   - Error type: export interface ApiErrorResponse { message: string; code?: string; details?: unknown; }

2. validators/{resource}.schema.ts — one file per API tag/resource.
   - import { z } from "zod"
   - One const <Resource>Schema = z.object({...}) per main model
   - One const Create<Resource>Schema for POST body
   - One const Update<Resource>Schema = Create<Resource>Schema.partial() for PUT/PATCH
   - Export inferred types: export type <Resource> = z.infer<typeof <Resource>Schema>

${FORMAT_RULES}`;
}
// ── Chunk 2: services (free providers, pass 2/3) ──────────────────────────────
function buildChunk2Prompt(spec, typesContent, baseUrl) {
    return `Generate Axios service classes from this API spec.
${baseUrl ? `Base URL: ${baseUrl}` : ''}

<types>
${typesContent.slice(0, 3000)}
</types>

<spec>
${spec.content}
</spec>

Generate ONLY services/{resource}.service.ts — one file per API tag:
- import apiClient from '../../api/client'
- import type { ... } from '../../types/index'
- export class <Resource>Service { static async methodName(...): Promise<...> { const { data } = await apiClient.METHOD(url, body); return data; } }
- One static async method per endpoint in the tag
- Path params as function args (e.g. id: string | number)
- Query params as optional object arg
- Typed return values using imported types

${FORMAT_RULES}`;
}
// ── Chunk 3: hooks + mocks + docs (free providers, pass 3/3) ─────────────────
function buildChunk3Prompt(resourceSignatures, allFilePaths, baseUrl) {
    return `Generate React Query v5 hooks, MSW mocks, and README from these service signatures.
${baseUrl ? `Base URL: ${baseUrl}` : ''}

<service_signatures>
${resourceSignatures}
</service_signatures>

Generate:
1. hooks/{resource}/index.ts — one file per service class above.
   - import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseMutationOptions } from "@tanstack/react-query"
   - import { queryKeys } from '../../api/queryKeys'
   - import { <Resource>Service } from '../../services/{resource}.service'
   - Key factory (use queryKeys.{resource}.list(), .detail(id), etc.)
   - useQuery hook per GET method: useQuery({ queryKey: ..., queryFn: () => ... })
   - useMutation per POST/PUT/PATCH/DELETE: useMutation({ mutationFn: ..., onSuccess: () => queryClient.invalidateQueries(...) })
   - enabled: !!id for detail queries

2. mocks/handlers.ts
   - import { http, HttpResponse } from 'msw'
   - One handler per endpoint from the signatures
   - Return realistic stub data matching the types

3. mocks/data.ts
   - Factory functions: createMock<Resource>(): <Resource> { return { id: '1', ... } }
   - createMock<Resource>List(count = 5): <Resource>[]

4. docs/README.md
   - ## Installation, ## Setup (QueryClientProvider), ## Environment Variables (.env.local), ## Usage per resource

${FORMAT_RULES}`;
}
// ── Single resource prompt (for api-gen generate <resource>) ──────────────────
function buildSingleResourcePrompt(resourceName, resourceSignatures, typesContent, baseUrl) {
    const r = resourceName.toLowerCase();
    return `Regenerate ALL files for the "${resourceName}" resource.
${baseUrl ? `Base URL: ${baseUrl}` : ''}

<types>
${typesContent.slice(0, 2000)}
</types>

<service_signatures>
${resourceSignatures}
</service_signatures>

Generate:
1. validators/${r}.schema.ts — Zod schemas for ${resourceName} models
2. services/${r}.service.ts — Axios service class for ${resourceName}
3. hooks/${r}/index.ts — React Query v5 hooks for ${resourceName}

${FORMAT_RULES}`;
}
// ── Response parser ───────────────────────────────────────────────────────────
function parseGeneratedFiles(response) {
    const files = [];
    const pattern = /<generated-file path="([^"]+)">([\s\S]*?)<\/generated-file>/g;
    let match;
    while ((match = pattern.exec(response)) !== null) {
        const filePath = match[1].trim();
        const content = match[2].replace(/^\n/, '').replace(/\n$/, '');
        if (filePath && content)
            files.push({ path: filePath, content });
    }
    return files;
}
// ── Utility: compact service signatures for chunk 3 context ──────────────────
function extractServiceSignatures(serviceFiles) {
    return serviceFiles
        .map((f) => {
        const lines = f.content.split('\n');
        const sig = lines.filter((l) => l.match(/^export\s+(class|function)/) ||
            l.match(/^\s+static\s+async\s+\w+/) ||
            l.match(/^\s+static\s+\w+\s*\(/) ||
            l.match(/^\s+async\s+\w+\s*\(/));
        return `// ${f.path}\n${sig.join('\n')}`;
    })
        .join('\n\n');
}
//# sourceMappingURL=prompts.js.map