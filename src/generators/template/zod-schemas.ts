import type { NormalizedSpec, SchemaModel } from './model';
import type { GeneratedFile } from '../../types';
import { tsTypeToZod } from './zod-from-ts';
import { extractTypeRefs } from './type-refs';
import { topoSort } from './topo-sort';

function safeName(name: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `'${name}'`;
}

function extractRefs(tsType: string, schemaNames: Set<string>, exclude: string): string[] {
  return extractTypeRefs(tsType, schemaNames).filter((tok) => tok !== exclude);
}

function schemaDeps(name: string, spec: NormalizedSpec, schemaNames: Set<string>): string[] {
  const schema = spec.schemas.get(name);
  if (schema?.kind === 'object') {
    return (schema.properties ?? []).flatMap((p) => extractRefs(p.tsType, schemaNames, name));
  }
  if (schema?.kind === 'alias') {
    return extractRefs(schema.aliasType ?? '', schemaNames, name);
  }
  return [];
}

function schemaBody(schema: SchemaModel, schemaNames: Set<string>): string {
  if (schema.kind === 'enum') {
    const values = schema.enumValues?.length ? schema.enumValues : ['unknown'];
    return `z.enum([${values.map((v) => `'${v}'`).join(', ')}])`;
  }
  if (schema.kind === 'alias') {
    return tsTypeToZod(schema.aliasType ?? 'unknown', schemaNames);
  }
  const fields = (schema.properties ?? []).map((p) => {
    const zod = tsTypeToZod(p.tsType, schemaNames);
    return `  ${safeName(p.name)}: ${zod}${p.required ? '' : '.optional()'},`;
  });
  return `z.object({\n${fields.join('\n') || ''}\n})`;
}

/** Any schema reachable from itself via schemaDeps — GraphQL types commonly form these (User <-> Post). */
function computeCyclicSchemas(allNames: string[], depsOf: (name: string) => string[]): Set<string> {
  const cyclic = new Set<string>();
  for (const start of allNames) {
    const seen = new Set<string>([start]);
    const stack = [...depsOf(start)];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === start) {
        cyclic.add(start);
        break;
      }
      if (seen.has(cur)) continue;
      seen.add(cur);
      stack.push(...depsOf(cur));
    }
  }
  return cyclic;
}

/**
 * Cyclic schemas need `z.lazy()` + an explicit `z.ZodType<T>` annotation — TS can't infer
 * the type of a Zod object whose initializer refers back to itself (directly or through
 * another schema), and z.lazy() also sidesteps the ESM circular-import evaluation-order
 * problem for schemas split across cross-tag files. ZodLazy has no .omit()/.partial(), so
 * the Create/Update companions are skipped for these.
 */
function schemaBlock(schema: SchemaModel, schemaNames: Set<string>, isCyclic: boolean): string {
  const body = schemaBody(schema, schemaNames);
  const lines = isCyclic
    ? [`export const ${schema.name}Schema: z.ZodType<${schema.name}> = z.lazy(() => ${body});`]
    : [`export const ${schema.name}Schema = ${body};`];
  lines.push(`export type ${schema.name}Parsed = z.infer<typeof ${schema.name}Schema>;`);

  const hasId = schema.kind === 'object' && schema.properties?.some((p) => p.name === 'id');
  if (hasId && !isCyclic) {
    lines.push(`export const Create${schema.name}Schema = ${schema.name}Schema.omit({ id: true });`);
    lines.push(`export const Update${schema.name}Schema = Create${schema.name}Schema.partial();`);
  }
  return lines.join('\n');
}

export function generateValidatorFiles(spec: NormalizedSpec): GeneratedFile[] {
  const schemaNames = new Set(spec.schemas.keys());
  const ownerTag = new Map<string, string>();
  for (const [tag, names] of spec.schemasByTag) {
    for (const name of names) ownerTag.set(name, tag);
  }
  const cyclicSchemas = computeCyclicSchemas(Array.from(schemaNames), (name) => schemaDeps(name, spec, schemaNames));

  const files: GeneratedFile[] = [];

  for (const [tag, rawNames] of spec.schemasByTag) {
    if (rawNames.length === 0) continue;
    const names = topoSort(rawNames, (name) => schemaDeps(name, spec, schemaNames));

    const crossTagImports = new Map<string, Set<string>>(); // otherTag -> schema names
    for (const name of names) {
      for (const ref of schemaDeps(name, spec, schemaNames)) {
        const owner = ownerTag.get(ref);
        if (owner && owner !== tag) {
          const set = crossTagImports.get(owner) ?? new Set<string>();
          set.add(`${ref}Schema`);
          crossTagImports.set(owner, set);
        }
      }
    }

    const importLines = Array.from(crossTagImports.entries()).map(
      ([otherTag, importedNames]) => `import { ${Array.from(importedNames).join(', ')} } from './${otherTag}.schema';`
    );

    const cyclicNamesHere = names.filter((n) => cyclicSchemas.has(n));
    const typeImportLine = cyclicNamesHere.length
      ? `import type { ${cyclicNamesHere.join(', ')} } from '../types/index';`
      : null;

    const blocks = names.map((name) => schemaBlock(spec.schemas.get(name)!, schemaNames, cyclicSchemas.has(name)));

    const content =
      [`import { z } from 'zod';`, ...(typeImportLine ? [typeImportLine] : []), ...importLines, '', ...blocks].join('\n') +
      '\n';
    files.push({ path: `validators/${tag}.schema.ts`, content });
  }

  return files;
}
