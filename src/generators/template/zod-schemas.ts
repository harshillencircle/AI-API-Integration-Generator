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

function schemaBlock(schema: SchemaModel, schemaNames: Set<string>): string {
  const lines = [`export const ${schema.name}Schema = ${schemaBody(schema, schemaNames)};`];
  lines.push(`export type ${schema.name}Parsed = z.infer<typeof ${schema.name}Schema>;`);

  const hasId = schema.kind === 'object' && schema.properties?.some((p) => p.name === 'id');
  if (hasId) {
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

    const blocks = names.map((name) => schemaBlock(spec.schemas.get(name)!, schemaNames));

    const content = [`import { z } from 'zod';`, ...importLines, '', ...blocks].join('\n') + '\n';
    files.push({ path: `validators/${tag}.schema.ts`, content });
  }

  return files;
}
