/** Extracts identifiers from a TS type expression that match a known schema name. */
export function extractTypeRefs(tsType: string, schemaNames: Set<string>): string[] {
  const tokens = tsType.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  return Array.from(new Set(tokens.filter((tok) => schemaNames.has(tok))));
}
