import type { NormalizedSpec } from './model';

const STATIC_TYPES = `export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: unknown;
}`;

export function generateTypesFile(spec: NormalizedSpec): string {
  const blocks: string[] = [];

  for (const schema of spec.schemas.values()) {
    if (schema.kind === 'enum') {
      const values = schema.enumValues?.length ? schema.enumValues : ['unknown'];
      blocks.push(`export type ${schema.name} = ${values.map((v) => `'${v}'`).join(' | ')};`);
      continue;
    }
    if (schema.kind === 'alias') {
      blocks.push(`export type ${schema.name} = ${schema.aliasType};`);
      continue;
    }
    const fields = (schema.properties ?? []).map((p) => {
      const doc = p.description ? `  /** ${p.description.replace(/\s+/g, ' ').trim()} */\n` : '';
      return `${doc}  ${safeName(p.name)}${p.required ? '' : '?'}: ${p.tsType};`;
    });
    blocks.push(`export interface ${schema.name} {\n${fields.join('\n') || '  [key: string]: unknown;'}\n}`);
  }

  return `${STATIC_TYPES}\n\n${blocks.join('\n\n')}\n`;
}

function safeName(name: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `'${name}'`;
}
