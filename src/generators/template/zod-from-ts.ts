/**
 * Converts a TS type expression produced by schemaToTsType() back into Zod
 * code. This only has to understand the exact shapes that generator emits
 * (object literals, arrays, unions of literals, Record<>, refs) — it is not
 * a general TS-to-Zod compiler.
 */
export function tsTypeToZod(tsType: string, schemaNames: Set<string>): string {
  const t = tsType.trim();

  if (t.endsWith(' | null')) {
    return `${tsTypeToZod(t.slice(0, -' | null'.length), schemaNames)}.nullable()`;
  }

  if (schemaNames.has(t)) return `${t}Schema`;

  if (t === 'string') return 'z.string()';
  if (t === 'number') return 'z.number()';
  if (t === 'boolean') return 'z.boolean()';
  if (t === 'unknown' || t === 'void') return 'z.unknown()';

  const arrayMatch = matchArray(t);
  if (arrayMatch) return `z.array(${tsTypeToZod(arrayMatch, schemaNames)})`;

  const recordMatch = t.match(/^Record<string,\s*(.+)>$/);
  if (recordMatch) return `z.record(z.string(), ${tsTypeToZod(recordMatch[1], schemaNames)})`;

  if (t.startsWith('{') && t.endsWith('}')) {
    const inner = t.slice(1, -1).trim();
    if (!inner) return 'z.record(z.string(), z.unknown())';
    const fields = splitTopLevel(inner, ';').map((field) => {
      const colonIdx = findTopLevelColon(field);
      const rawKey = field.slice(0, colonIdx).trim();
      const rawType = field.slice(colonIdx + 1).trim();
      const optional = rawKey.endsWith('?');
      const key = optional ? rawKey.slice(0, -1) : rawKey;
      const zod = tsTypeToZod(rawType, schemaNames);
      return `${key}: ${zod}${optional ? '.optional()' : ''}`;
    });
    return `z.object({ ${fields.join(', ')} })`;
  }

  if (t.includes(' | ')) {
    const parts = splitTopLevel(t, '|').map((p) => p.trim());
    const allStringLiterals = parts.every((p) => /^'.*'$/.test(p));
    if (allStringLiterals) return `z.enum([${parts.join(', ')}])`;
    return `z.union([${parts.map((p) => literalOrType(p, schemaNames)).join(', ')}])`;
  }

  if (/^'.*'$/.test(t)) return `z.literal(${t})`;
  if (/^-?\d+(\.\d+)?$/.test(t)) return `z.literal(${t})`;

  return 'z.unknown()';
}

function literalOrType(part: string, schemaNames: Set<string>): string {
  if (/^'.*'$/.test(part)) return `z.literal(${part})`;
  return tsTypeToZod(part, schemaNames);
}

function matchArray(t: string): string | null {
  if (!t.endsWith('[]')) return null;
  // Guard against splitting "A | B[]" wrongly — only strip a trailing []
  // when the rest of the string has balanced brackets/braces.
  const inner = t.slice(0, -2);
  return balanced(inner) ? inner : null;
}

function balanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === '{' || ch === '<' || ch === '(') depth++;
    if (ch === '}' || ch === '>' || ch === ')') depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export function splitTopLevel(s: string, delim: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{' || ch === '<' || ch === '(') depth++;
    if (ch === '}' || ch === '>' || ch === ')') depth--;
    if (ch === delim && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.filter((p) => p.trim().length > 0);
}

export function findTopLevelColon(field: string): number {
  let depth = 0;
  for (let i = 0; i < field.length; i++) {
    const ch = field[i];
    if (ch === '{' || ch === '<' || ch === '(') depth++;
    if (ch === '}' || ch === '>' || ch === ')') depth--;
    if (ch === ':' && depth === 0) return i;
  }
  return field.indexOf(':');
}
