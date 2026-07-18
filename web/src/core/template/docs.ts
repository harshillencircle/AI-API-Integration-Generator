import type { EndpointModel, NormalizedSpec } from './model';
import type { GeneratedFile } from '../types';
import { toCamelCase, toPascalCase } from './naming';
import { mockExprForType } from './mocks';

function queryParamsField(ep: EndpointModel): string {
  const fields = ep.queryParams.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.tsType}`).join('; ');
  return `{ ${fields} }`;
}

/** Mirrors hooks.ts's buildMutationHook parameter shape so the README example actually matches the generated hook signature. */
function buildMutationExampleArg(ep: EndpointModel, schemaNames: Set<string>): string {
  if (ep.postmanGraphql) return mockExprForType(ep.postmanGraphql.variablesType, schemaNames);

  const inputCount = ep.pathParams.length + (ep.requestBodyType ? 1 : 0) + (ep.queryParams.length ? 1 : 0);
  if (inputCount === 0) return '';
  if (inputCount === 1 && ep.pathParams.length === 1) return defaultArgLiteral(ep.pathParams[0].tsType);
  if (inputCount === 1 && ep.requestBodyType) return mockExprForType(ep.requestBodyType, schemaNames);
  if (inputCount === 1 && ep.queryParams.length) return mockExprForType(queryParamsField(ep), schemaNames);

  const fields: string[] = [];
  for (const p of ep.pathParams) fields.push(`${p.name}: ${defaultArgLiteral(p.tsType)}`);
  if (ep.requestBodyType) fields.push(`body: ${mockExprForType(ep.requestBodyType, schemaNames)}`);
  if (ep.queryParams.length) fields.push(`params: ${mockExprForType(queryParamsField(ep), schemaNames)}`);
  return `{ ${fields.join(', ')} }`;
}

/** Mock factories referenced by an example arg expression, e.g. "createMockUser()" -> ["createMockUser"]. */
function mockFactoryNames(argExpr: string): string[] {
  const matches = argExpr.match(/createMock[A-Za-z0-9_]*/g) ?? [];
  return Array.from(new Set(matches));
}

const FOLDER_ORDER = ['api', 'types', 'validators', 'services', 'hooks', 'mocks'];
const FOLDER_PURPOSE: Record<string, string> = {
  api: 'infrastructure (client, auth, errors, response validation, query keys)',
  types: 'TypeScript interfaces',
  validators: 'Zod schemas, grouped by resource — used automatically by services/ to validate responses',
  services: 'Axios service classes, grouped by resource',
  hooks: 'React Query hooks, grouped by resource',
  mocks: 'MSW handlers + factory data for local development',
};

/** Renders the actual files this run produced, grouped by top-level folder — not a generic description. */
function renderGeneratedFileTree(filePaths: string[]): string {
  const byFolder = new Map<string, string[]>();
  for (const path of filePaths) {
    const folder = path.includes('/') ? path.split('/')[0] : '(root)';
    const list = byFolder.get(folder) ?? [];
    list.push(path);
    byFolder.set(folder, list);
  }

  const folders = Array.from(byFolder.keys()).sort((a, b) => {
    const ai = FOLDER_ORDER.indexOf(a);
    const bi = FOLDER_ORDER.indexOf(b);
    return (ai === -1 ? FOLDER_ORDER.length : ai) - (bi === -1 ? FOLDER_ORDER.length : bi);
  });

  return folders
    .map((folder) => {
      const purpose = FOLDER_PURPOSE[folder];
      const header = purpose ? `${folder}/  — ${purpose}` : `${folder}/`;
      const files = byFolder.get(folder)!.sort().map((p) => `  ${p}`);
      return [header, ...files].join('\n');
    })
    .join('\n\n');
}

export function generateReadme(spec: NormalizedSpec, filePaths: string[]): GeneratedFile {
  const schemaNames = new Set(spec.schemas.keys());
  const byTag = new Map<string, EndpointModel[]>();
  for (const ep of spec.endpoints) {
    const list = byTag.get(ep.tag) ?? [];
    list.push(ep);
    byTag.set(ep.tag, list);
  }

  const usageSections = Array.from(byTag.entries()).map(([tag, endpoints]) => {
    const queryEp = endpoints.find((e) => e.method === 'get');
    const mutationEp = endpoints.find((e) => e.method !== 'get');
    const lines = [`### ${toPascalCase(tag)}`, ''];
    if (queryEp) {
      lines.push(
        '```tsx',
        `import { use${toPascalCase(queryEp.operationId)} } from './hooks/${toCamelCase(tag)}';`,
        '',
        `function Example() {`,
        `  const { data, isLoading } = use${toPascalCase(queryEp.operationId)}(${queryEp.pathParams.map((p) => defaultArgLiteral(p.tsType)).join(', ')});`,
        `  // ...`,
        `}`,
        '```'
      );
      if (mutationEp) lines.push('');
    }
    if (mutationEp) {
      const arg = buildMutationExampleArg(mutationEp, schemaNames);
      const factories = mockFactoryNames(arg);
      lines.push(
        '```tsx',
        `import { use${toPascalCase(mutationEp.operationId)} } from './hooks/${toCamelCase(tag)}';`,
        ...(factories.length ? [`import { ${factories.join(', ')} } from './mocks/data';`] : []),
        '',
        `function Example() {`,
        `  const { mutate } = use${toPascalCase(mutationEp.operationId)}();`,
        `  mutate(${arg});`,
        `}`,
        '```'
      );
    }
    return lines.join('\n');
  });

  // Only true single-endpoint GraphQL APIs share one URL — a Postman collection can mix a few
  // GraphQL-shaped requests in among otherwise-plain REST endpoints, so "some" would wrongly
  // claim the whole API is GraphQL-only.
  const isPureGraphQL = spec.endpoints.length > 0 && spec.endpoints.every((e) => e.graphql || e.postmanGraphql);
  const warningsSection =
    spec.warnings?.length ?
      `## Normalization warnings

The generator made best-effort assumptions while parsing your spec. Review these before shipping:

${spec.warnings.map((w) => `- ${w}`).join('\n')}

`
    : '';

  const content = `# ${spec.title} — Generated Integration

Generated by a deterministic, template-based pipeline (no AI, no API key required).
Re-run generation any time the spec changes — output is reproducible.

${warningsSection}## Installation

\`\`\`bash
npm install axios zod @tanstack/react-query msw
\`\`\`

## Environment Variables (optional)

Both of these already have working defaults baked into the generated code — you only need a
\`.env.local\` if you want to override them (e.g. different base URLs per environment).

\`\`\`bash
# .env.local
# Defaults to '${spec.baseUrl ?? 'https://api.example.com'}' (from the spec) if unset.
NEXT_PUBLIC_API_BASE_URL=${spec.baseUrl ?? 'https://api.example.com'}
# Defaults to '/auth/refresh' if unset.
NEXT_PUBLIC_API_REFRESH_PATH=/auth/refresh
\`\`\`
${isPureGraphQL ? '\nPoint this at your GraphQL endpoint directly (e.g. `https://api.example.com/graphql`) — every generated service method POSTs to this single URL.\n' : ''}
## Setup

\`\`\`tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
\`\`\`

## Auth & token refresh

\`api/auth.ts\` stores the access/refresh tokens (via \`setAuthTokens\`) and \`api/client.ts\`'s 401 interceptor
calls \`refreshAccessToken()\` automatically before rejecting a request. By default this POSTs
\`{ refreshToken }\` to \`NEXT_PUBLIC_API_REFRESH_PATH\` (default \`/auth/refresh\`) and expects
\`{ accessToken, refreshToken }\` back. If your API's refresh contract differs, edit
\`refreshAccessToken()\` in \`api/auth.ts\` directly.

## Response validation

Every service method in \`services/\` parses its response through the matching Zod schema from
\`validators/\` before returning it (\`validateResponse()\`, defined in \`api/validate.ts\`). If the
API returns a shape that doesn't match the spec, the method throws an \`ApiError\` with
\`code: 'INVALID_RESPONSE'\` instead of silently passing bad data to your components.

## Usage

${usageSections.join('\n\n')}

## Generated files

Output is organized by concern rather than one file per resource — each layer (types, validation,
services, hooks) lives in its own folder so shared types and cross-resource schemas aren't duplicated.
These are the exact files this run produced from your spec:

\`\`\`
${renderGeneratedFileTree(filePaths)}

docs/  — this file
  docs/README.md
\`\`\`
`;

  return { path: 'docs/README.md', content };
}

function defaultArgLiteral(tsType: string): string {
  if (tsType === 'number') return '1';
  if (tsType === 'boolean') return 'true';
  return "'id'";
}
