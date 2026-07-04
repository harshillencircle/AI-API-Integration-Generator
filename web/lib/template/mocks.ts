import type { EndpointModel, NormalizedSpec, SchemaModel } from './model';
import type { GeneratedFile } from '../types';
import { toPascalCase } from './naming';
import { extractTypeRefs } from './type-refs';
import { topoSort } from './topo-sort';
import { splitTopLevel, findTopLevelColon } from './zod-from-ts';

function mockExprForType(tsType: string, schemaNames: Set<string>, fieldHint = 'value'): string {
  const t = tsType.trim();

  if (t.endsWith(' | null')) return mockExprForType(t.slice(0, -' | null'.length), schemaNames, fieldHint);
  if (schemaNames.has(t)) return `createMock${t}()`;
  if (t === 'string') return `'sample-${fieldHint}'`;
  if (t === 'number') return '1';
  if (t === 'boolean') return 'false';
  if (t === 'unknown' || t === 'void') return 'null';

  if (t.endsWith('[]')) {
    const inner = t.slice(0, -2);
    return `[${mockExprForType(inner, schemaNames, fieldHint)}]`;
  }

  const recordMatch = t.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) return '{}';

  if (t.startsWith('{') && t.endsWith('}')) {
    const inner = t.slice(1, -1).trim();
    if (!inner) return '{}';
    const fields = splitTopLevel(inner, ';').map((field) => {
      const colonIdx = findTopLevelColon(field);
      const rawKey = field.slice(0, colonIdx).trim().replace(/\?$/, '');
      const rawType = field.slice(colonIdx + 1).trim();
      return `${rawKey}: ${mockExprForType(rawType, schemaNames, rawKey)}`;
    });
    return `{ ${fields.join(', ')} }`;
  }

  if (t.includes(' | ')) {
    const first = splitTopLevel(t, '|')[0]?.trim();
    if (first && /^'.*'$/.test(first)) return first;
    return mockExprForType(first ?? 'unknown', schemaNames, fieldHint);
  }

  if (/^'.*'$/.test(t)) return t;
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;

  return 'null';
}

function factoryName(schemaName: string): string {
  return `createMock${schemaName}`;
}

function schemaDeps(name: string, spec: NormalizedSpec, schemaNames: Set<string>): string[] {
  const schema = spec.schemas.get(name);
  if (schema?.kind === 'object') {
    return (schema.properties ?? []).flatMap((p) => extractTypeRefs(p.tsType, schemaNames).filter((r) => r !== name));
  }
  if (schema?.kind === 'alias') {
    return extractTypeRefs(schema.aliasType ?? '', schemaNames).filter((r) => r !== name);
  }
  return [];
}

function factoryBlock(schema: SchemaModel, schemaNames: Set<string>): string {
  if (schema.kind === 'enum') {
    const value = schema.enumValues?.[0] ? `'${schema.enumValues[0]}'` : "'unknown'";
    return `export function ${factoryName(schema.name)}(): ${schema.name} {\n  return ${value};\n}`;
  }
  if (schema.kind === 'alias') {
    return `export function ${factoryName(schema.name)}(): ${schema.name} {\n  return ${mockExprForType(schema.aliasType ?? 'unknown', schemaNames)} as ${schema.name};\n}`;
  }
  const fields = (schema.properties ?? []).map(
    (p) => `    ${p.name}: ${mockExprForType(p.tsType, schemaNames, p.name)},`
  );
  const hasId = (schema.properties ?? []).some((p) => p.name === 'id');
  const listOverride = hasId ? '{ id: i + 1 }' : '{}';
  return `export function ${factoryName(schema.name)}(overrides: Partial<${schema.name}> = {}): ${schema.name} {
  return {
${fields.join('\n')}
    ...overrides,
  };
}

export function ${factoryName(schema.name)}List(count = 5): ${schema.name}[] {
  return Array.from({ length: count }, (_, i) => ${factoryName(schema.name)}(${listOverride}));
}`;
}

export function generateMockDataFile(spec: NormalizedSpec): GeneratedFile {
  const schemaNames = new Set(spec.schemas.keys());
  const orderedNames = topoSort(Array.from(schemaNames), (name) => schemaDeps(name, spec, schemaNames));

  const blocks = orderedNames.map((name) => factoryBlock(spec.schemas.get(name)!, schemaNames));
  const importLine = orderedNames.length ? `import type { ${orderedNames.join(', ')} } from '../types/index';\n\n` : '';
  const content = `${importLine}${blocks.join('\n\n')}\n`;

  return { path: 'mocks/data.ts', content };
}

export function generateMockHandlersFile(spec: NormalizedSpec): GeneratedFile {
  const byTag = new Map<string, EndpointModel[]>();
  for (const ep of spec.endpoints) {
    const list = byTag.get(ep.tag) ?? [];
    list.push(ep);
    byTag.set(ep.tag, list);
  }

  const usedFactories = new Set<string>();
  const handlers: string[] = [];

  for (const [, endpoints] of byTag) {
    for (const ep of endpoints) {
      const mswPath = ep.path.replace(/\{([^}]+)\}/g, ':$1');
      const responseFactory = spec.schemas.has(ep.responseType.replace(/\[\]$/, ''))
        ? ep.responseType.endsWith('[]')
          ? `${factoryName(ep.responseType.slice(0, -2))}List()`
          : `${factoryName(ep.responseType)}()`
        : null;
      if (responseFactory) {
        const baseName = ep.responseType.replace(/\[\]$/, '');
        usedFactories.add(baseName);
      }

      const body = responseFactory
        ? `HttpResponse.json(${responseFactory})`
        : ep.responseType === 'void'
          ? 'new HttpResponse(null, { status: 204 })'
          : 'HttpResponse.json({})';

      handlers.push(`  http.${ep.method}('${mswPath}', () => {\n    return ${body};\n  }),`);
    }
  }

  const factoryImports = Array.from(usedFactories).flatMap((n) => [factoryName(n), `${factoryName(n)}List`]);
  const importLine = factoryImports.length
    ? `import { ${Array.from(new Set(factoryImports)).join(', ')} } from './data';\n`
    : '';

  const content =
    `import { http, HttpResponse } from 'msw';\n${importLine}\n` +
    `export const handlers = [\n${handlers.join('\n')}\n];\n`;

  return { path: 'mocks/handlers.ts', content };
}
