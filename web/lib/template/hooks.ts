import type { EndpointModel, NormalizedSpec } from './model';
import type { GeneratedFile } from '../types';
import { toCamelCase, toPascalCase } from './naming';
import { extractTypeRefs } from './type-refs';

function groupByTag(spec: NormalizedSpec): Map<string, EndpointModel[]> {
  const byTag = new Map<string, EndpointModel[]>();
  for (const ep of spec.endpoints) {
    const list = byTag.get(ep.tag) ?? [];
    list.push(ep);
    byTag.set(ep.tag, list);
  }
  return byTag;
}

export function generateQueryKeysFile(spec: NormalizedSpec): GeneratedFile {
  const tags = Array.from(groupByTag(spec).keys());
  const blocks = tags.map(
    (tag) => `  ${tag}: {
    all: ['${tag}'] as const,
    lists: () => [...queryKeys.${tag}.all, 'list'] as const,
    list: (params?: unknown) => [...queryKeys.${tag}.lists(), params] as const,
    details: () => [...queryKeys.${tag}.all, 'detail'] as const,
    detail: (id: string | number) => [...queryKeys.${tag}.details(), id] as const,
  },`
  );
  const content = `export const queryKeys = {\n${blocks.join('\n')}\n};\n`;
  return { path: 'api/queryKeys.ts', content };
}

function queryParamsField(ep: EndpointModel): string {
  const fields = ep.queryParams.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.tsType}`).join('; ');
  return `{ ${fields} }`;
}

function isDetailQuery(ep: EndpointModel): boolean {
  return ep.pathParams.length > 0;
}

function buildQueryHook(ep: EndpointModel, tag: string, serviceClass: string): string {
  const args: string[] = [];
  for (const p of ep.pathParams) args.push(`${p.name}: ${p.tsType}`);
  if (ep.queryParams.length) {
    const allOptional = ep.queryParams.every((p) => !p.required);
    args.push(`params${allOptional ? '?' : ''}: ${queryParamsField(ep)}`);
  }

  const callArgs = [...ep.pathParams.map((p) => p.name), ...(ep.queryParams.length ? ['params'] : [])].join(', ');
  const detail = isDetailQuery(ep);
  const keyExpr = detail
    ? `queryKeys.${tag}.detail(${ep.pathParams[0]?.name})`
    : `queryKeys.${tag}.list(${ep.queryParams.length ? 'params' : ''})`;
  const enabledLine = detail ? `\n    enabled: !!${ep.pathParams[0]?.name},` : '';

  const hookName = `use${toPascalCase(ep.operationId)}`;
  return `export function ${hookName}(${args.join(', ')}) {
  return useQuery({
    queryKey: ${keyExpr},
    queryFn: () => ${serviceClass}.${ep.operationId}(${callArgs}),${enabledLine}
  });
}`;
}

function buildMutationHook(ep: EndpointModel, tag: string, serviceClass: string): string {
  const inputCount = ep.pathParams.length + (ep.requestBodyType ? 1 : 0) + (ep.queryParams.length ? 1 : 0);
  const hookName = `use${toPascalCase(ep.operationId)}`;

  let paramDecl = '';
  let callArgs = '';

  if (inputCount === 0) {
    paramDecl = '';
    callArgs = '';
  } else if (inputCount === 1 && ep.pathParams.length === 1) {
    const p = ep.pathParams[0];
    paramDecl = `(${p.name}: ${p.tsType})`;
    callArgs = p.name;
  } else if (inputCount === 1 && ep.requestBodyType) {
    paramDecl = `(body: ${ep.requestBodyType})`;
    callArgs = 'body';
  } else if (inputCount === 1 && ep.queryParams.length) {
    paramDecl = `(params: ${queryParamsField(ep)})`;
    callArgs = 'params';
  } else {
    const fields: string[] = [];
    const args: string[] = [];
    for (const p of ep.pathParams) {
      fields.push(`${p.name}: ${p.tsType}`);
      args.push(`vars.${p.name}`);
    }
    if (ep.requestBodyType) {
      fields.push(`body: ${ep.requestBodyType}`);
      args.push('vars.body');
    }
    if (ep.queryParams.length) {
      fields.push(`params: ${queryParamsField(ep)}`);
      args.push('vars.params');
    }
    paramDecl = `(vars: { ${fields.join('; ')} })`;
    callArgs = args.join(', ');
  }

  return `export function ${hookName}() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ${paramDecl || '()'} => ${serviceClass}.${ep.operationId}(${callArgs}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.${tag}.lists() }),
  });
}`;
}

export function generateHookFiles(spec: NormalizedSpec): GeneratedFile[] {
  const schemaNames = new Set(spec.schemas.keys());
  const byTag = groupByTag(spec);
  const files: GeneratedFile[] = [];

  for (const [tag, endpoints] of byTag) {
    const serviceClass = `${toPascalCase(tag)}Service`;
    const usedTypes = new Set<string>();
    for (const ep of endpoints) {
      if (ep.requestBodyType) extractTypeRefs(ep.requestBodyType, schemaNames).forEach((t) => usedTypes.add(t));
      if (ep.responseType) extractTypeRefs(ep.responseType, schemaNames).forEach((t) => usedTypes.add(t));
      for (const p of [...ep.pathParams, ...ep.queryParams]) {
        extractTypeRefs(p.tsType, schemaNames).forEach((t) => usedTypes.add(t));
      }
    }

    const hooks = endpoints.map((ep) =>
      ep.method === 'get' ? buildQueryHook(ep, tag, serviceClass) : buildMutationHook(ep, tag, serviceClass)
    );

    const typeImport = usedTypes.size
      ? `import type { ${Array.from(usedTypes).join(', ')} } from '../../types/index';\n`
      : '';

    const content =
      `import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';\n` +
      `import { queryKeys } from '../../api/queryKeys';\n` +
      `import { ${serviceClass} } from '../../services/${tag}.service';\n` +
      `${typeImport}\n${hooks.join('\n\n')}\n`;

    files.push({ path: `hooks/${toCamelCase(tag)}/index.ts`, content });
  }

  return files;
}
