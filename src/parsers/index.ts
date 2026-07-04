import * as fs from 'fs-extra';
import * as path from 'path';

export type SpecFormat = 'openapi' | 'postman' | 'graphql-sdl' | 'graphql-introspection' | 'unknown';

export interface SpecInfo {
  content: string;
  format: SpecFormat;
  filename: string;
}

export async function loadSpec(input: string): Promise<SpecInfo> {
  let content: string;
  let filename: string;

  if (input.startsWith('http://') || input.startsWith('https://')) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
    }
    content = await response.text();
    const urlPath = new URL(input).pathname;
    filename = urlPath.split('/').pop() || 'spec';
  } else {
    const resolvedPath = path.resolve(input);
    if (!(await fs.pathExists(resolvedPath))) {
      throw new Error(`File not found: ${resolvedPath}`);
    }
    content = await fs.readFile(resolvedPath, 'utf-8');
    filename = path.basename(input);
  }

  const format = detectFormat(content);
  return { content, format, filename };
}

/**
 * Builds a SpecInfo directly from in-memory content (pasted text or an
 * uploaded file's contents) instead of reading from disk/URL — used by the
 * web app where there is no filesystem to read from.
 */
export function parseSpecContent(content: string, filename = 'spec'): SpecInfo {
  return { content, format: detectFormat(content), filename };
}

function detectFormat(content: string): SpecFormat {
  // Try JSON first
  try {
    const parsed = JSON.parse(content);

    if (parsed.openapi || parsed.swagger) {
      return 'openapi';
    }

    // Postman collection v2 / v2.1
    if (
      parsed.info?.schema?.includes('schema.getpostman.com') ||
      (parsed.info && Array.isArray(parsed.item))
    ) {
      return 'postman';
    }

    // GraphQL introspection result
    if (parsed.data?.__schema || parsed.__schema) {
      return 'graphql-introspection';
    }

    return 'unknown';
  } catch {
    // Not JSON — try text/YAML markers
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

/**
 * Strips verbose fields (descriptions >80 chars, examples, extensions) from
 * JSON specs to reduce token count for providers with tight free-tier limits.
 * Preserves all structural information needed for code generation.
 */
export function slimSpec(spec: SpecInfo): SpecInfo {
  if (spec.format !== 'openapi' && spec.format !== 'postman') return spec;
  try {
    const parsed = JSON.parse(spec.content);
    const slimmed = dropVerbose(parsed) as object;
    // Compact JSON — no whitespace — minimises token count
    return { ...spec, content: JSON.stringify(slimmed) };
  } catch {
    return spec;
  }
}

function dropVerbose(val: unknown): unknown {
  if (Array.isArray(val)) return val.map(dropVerbose);
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (k === 'example' || k === 'examples' || k.startsWith('x-')) continue;
      if (k === 'description' && typeof v === 'string' && v.length > 80) {
        out[k] = v.slice(0, 77) + '...';
      } else {
        out[k] = dropVerbose(v);
      }
    }
    return out;
  }
  return val;
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
