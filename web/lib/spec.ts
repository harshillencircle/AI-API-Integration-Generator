import type { SpecFormat, SpecInfo } from './types';

/** Builds a SpecInfo from pasted/uploaded text — no filesystem involved. */
export function parseSpecContent(content: string, filename = 'spec'): SpecInfo {
  return { content, format: detectFormat(content), filename };
}

function detectFormat(content: string): SpecFormat {
  try {
    const parsed = JSON.parse(content);

    if (parsed.openapi || parsed.swagger) return 'openapi';

    if (
      parsed.info?.schema?.includes('schema.getpostman.com') ||
      (parsed.info && Array.isArray(parsed.item))
    ) {
      return 'postman';
    }

    if (parsed.data?.__schema || parsed.__schema) return 'graphql-introspection';

    return 'unknown';
  } catch {
    if (content.match(/^openapi:|^swagger:/m)) return 'openapi';
    if (
      content.match(/^type\s+Query\s*\{/m) ||
      content.match(/^type\s+Mutation\s*\{/m) ||
      content.match(/^schema\s*\{/m)
    ) {
      return 'graphql-sdl';
    }
    return 'unknown';
  }
}

export function formatDisplayName(format: SpecFormat): string {
  const names: Record<SpecFormat, string> = {
    openapi: 'OpenAPI / Swagger',
    postman: 'Postman Collection',
    'graphql-sdl': 'GraphQL SDL',
    'graphql-introspection': 'GraphQL Introspection JSON',
    unknown: 'Unknown (will attempt generation)',
  };
  return names[format];
}
