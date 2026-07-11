/** Splits an identifier-ish string (snake_case, kebab-case, path segments, etc.) into words. */
function words(input: string): string[] {
  return input
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function toPascalCase(input: string): string {
  return words(input)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

export function toCamelCase(input: string): string {
  const pascal = toPascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** camelCase/PascalCase-safe identifier, falling back to a prefix if it would start with a digit. */
export function safeIdentifier(input: string, fallbackPrefix = 'Item'): string {
  const pascal = toPascalCase(input) || fallbackPrefix;
  return /^[0-9]/.test(pascal) ? `${fallbackPrefix}${pascal}` : pascal;
}

/** Builds an operationId-style camelCase method name from method + path when the spec has none. */
export function methodNameFromPath(method: string, path: string): string {
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith('{') ? `By${toPascalCase(seg.slice(1, -1))}` : toPascalCase(seg)));
  return toCamelCase(`${method} ${segments.join(' ')}`);
}

/** Wraps a property name in quotes if it isn't a valid bare identifier. */
export function safePropName(name: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `'${name}'`;
}
