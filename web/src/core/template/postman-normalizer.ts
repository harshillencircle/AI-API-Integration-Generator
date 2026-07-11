import { toCamelCase, toPascalCase, safeIdentifier, safePropName } from './naming';
import { extractTypeRefs } from './type-refs';
import type { EndpointModel, HttpMethod, NormalizedSpec, ParamModel, PropertyModel, SchemaModel } from './model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];
const SUCCESS_CODES = ['200', '201', '202', '204'];

/** Postman collections have no type system — infers a TS type from a live example value. */
function jsonValueToTsType(value: unknown): string {
  if (value === null || value === undefined) return 'unknown';
  if (Array.isArray(value)) {
    return value.length === 0 ? 'unknown[]' : `${jsonValueToTsType(value[0])}[]`;
  }
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object': {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return 'Record<string, unknown>';
      const fields = entries.map(([key, val]) => `${safePropName(key)}?: ${jsonValueToTsType(val)}`);
      return `{ ${fields.join('; ')} }`;
    }
    default:
      return 'unknown';
  }
}

/**
 * Registers a named object schema for a top-level request/response body example
 * and returns the TS type expression to reference it (nested objects stay inline —
 * only the top level, and array item shapes, get a name, to avoid schema explosion).
 */
function registerBodySchema(schemas: Map<string, SchemaModel>, name: string, value: unknown): string {
  if (value === null || value === undefined) return 'void';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    return `${registerBodySchema(schemas, `${name}Item`, value[0])}[]`;
  }
  if (typeof value === 'object') {
    const safe = safeIdentifier(name, 'Schema');
    if (!schemas.has(safe)) {
      const properties: PropertyModel[] = Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
        name: key,
        tsType: jsonValueToTsType(val),
        required: false,
      }));
      schemas.set(safe, { name: safe, kind: 'object', properties });
    }
    return safe;
  }
  return jsonValueToTsType(value);
}

function valueTsType(value: unknown): string {
  if (typeof value !== 'string') return 'string';
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number';
  if (value === 'true' || value === 'false') return 'boolean';
  return 'string';
}

interface ParsedUrl {
  pathTemplate: string;
  pathParams: ParamModel[];
  queryParams: ParamModel[];
}

/** Strips a Postman URL down to an OpenAPI-style `{param}` path template + params. */
function parseUrl(url: Json): ParsedUrl {
  const pathParams: ParamModel[] = [];
  const queryParams: ParamModel[] = [];

  if (url == null) return { pathTemplate: '/', pathParams, queryParams };

  if (typeof url === 'string') {
    const [beforeQuery, queryStr] = url.split('?');
    let pathPart = beforeQuery.replace(/^https?:\/\/[^/]+/, '').replace(/^\{\{[^}]+\}\}/, '');
    if (!pathPart.startsWith('/')) pathPart = `/${pathPart}`;
    const segments = pathPart
      .split('/')
      .map((seg) => {
        if (!seg.startsWith(':')) return seg;
        const name = seg.slice(1);
        pathParams.push({ name, tsType: 'string', required: true });
        return `{${name}}`;
      });
    if (queryStr) {
      for (const pair of queryStr.split('&')) {
        if (!pair) continue;
        const [k, v] = pair.split('=');
        if (!k) continue;
        queryParams.push({ name: decodeURIComponent(k), tsType: valueTsType(v ?? ''), required: false });
      }
    }
    return { pathTemplate: segments.join('/') || '/', pathParams, queryParams };
  }

  const rawSegments: Json[] = Array.isArray(url.path) ? url.path : [];
  const variableList: Json[] = Array.isArray(url.variable) ? url.variable : [];
  const varMap = new Map<string, Json>(variableList.map((v) => [String(v.key), v]));

  const segments = rawSegments.map((seg) => {
    if (typeof seg !== 'string' || !seg.startsWith(':')) return String(seg);
    const name = seg.slice(1);
    const known = varMap.get(name);
    pathParams.push({ name, tsType: valueTsType(known?.value), required: true });
    return `{${name}}`;
  });

  const queryList: Json[] = Array.isArray(url.query) ? url.query : [];
  for (const q of queryList) {
    if (!q || q.disabled || typeof q.key !== 'string' || !q.key) continue;
    queryParams.push({ name: q.key, tsType: valueTsType(q.value), required: false });
  }

  return { pathTemplate: `/${segments.filter(Boolean).join('/')}`, pathParams, queryParams };
}

function rawLanguageToContentType(language: string | undefined): string {
  switch ((language ?? '').toLowerCase()) {
    case 'xml':
      return 'application/xml';
    case 'html':
      return 'text/html';
    case 'javascript':
    case 'json':
      return 'application/json';
    default:
      return 'text/plain';
  }
}

interface RequestBodyResult {
  requestBodyType?: string;
  requestContentType?: string;
}

function extractRequestBody(
  schemas: Map<string, SchemaModel>,
  opBaseName: string,
  body: Json,
  warnings: string[]
): RequestBodyResult {
  if (!body || !body.mode) return {};

  if (body.mode === 'raw') {
    const raw = typeof body.raw === 'string' ? body.raw.trim() : '';
    if (!raw) return {};
    try {
      return {
        requestBodyType: registerBodySchema(schemas, `${opBaseName}Request`, JSON.parse(raw)),
        requestContentType: 'application/json',
      };
    } catch {
      const language = body.options?.raw?.language;
      const contentType = rawLanguageToContentType(typeof language === 'string' ? language : undefined);
      warnings.push(
        `Request body for '${opBaseName}' is non-JSON (${language ?? 'unknown'}); typed as string with Content-Type ${contentType}`
      );
      return { requestBodyType: 'string', requestContentType: contentType };
    }
  }

  if (body.mode === 'urlencoded') {
    const entries: Json[] = Array.isArray(body.urlencoded) ? body.urlencoded : [];
    const active = entries.filter((e) => !e.disabled && typeof e.key === 'string' && e.key);
    if (!active.length) return {};
    const obj: Record<string, unknown> = {};
    for (const e of active) obj[e.key] = e.value ?? '';
    return {
      requestBodyType: registerBodySchema(schemas, `${opBaseName}Request`, obj),
      requestContentType: 'application/x-www-form-urlencoded',
    };
  }

  if (body.mode === 'formdata') {
    const entries: Json[] = Array.isArray(body.formdata) ? body.formdata : [];
    const active = entries.filter((e) => !e.disabled && typeof e.key === 'string' && e.key);
    if (!active.length) return {};
    const obj: Record<string, unknown> = {};
    for (const e of active) obj[e.key] = e.value ?? '';
    return {
      requestBodyType: registerBodySchema(schemas, `${opBaseName}Request`, obj),
      requestContentType: 'multipart/form-data',
    };
  }

  if (body.mode === 'file') {
    warnings.push(`Request body for '${opBaseName}' uses file upload mode; typed as FormData`);
    return { requestBodyType: 'FormData', requestContentType: 'multipart/form-data' };
  }

  if (body.mode === 'graphql') {
    warnings.push(`Request '${opBaseName}' is a GraphQL body in Postman — use GraphQL SDL/introspection input instead`);
  }

  return {};
}

function extractResponseType(
  schemas: Map<string, SchemaModel>,
  opBaseName: string,
  responses: Json,
  warnings: string[]
): string {
  if (!Array.isArray(responses) || !responses.length) return 'void';
  const success = responses.find((r) => SUCCESS_CODES.includes(String(r.code))) ?? responses[0];
  const raw = typeof success?.body === 'string' ? success.body.trim() : '';
  if (!raw) return 'void';
  try {
    const parsed = JSON.parse(raw);
    return parsed === null ? 'void' : registerBodySchema(schemas, `${opBaseName}Response`, parsed);
  } catch {
    warnings.push(`Response body for '${opBaseName}' is non-JSON; typed as string`);
    return 'string';
  }
}

function buildEndpoint(
  schemas: Map<string, SchemaModel>,
  tag: string,
  item: Json,
  usedOpIds: Map<string, Set<string>>,
  warnings: string[]
): EndpointModel | undefined {
  const req = item.request;
  if (!req) return undefined;

  const method = String(req.method ?? 'get').toLowerCase() as HttpMethod;
  if (!HTTP_METHODS.includes(method)) return undefined;

  const { pathTemplate, pathParams, queryParams } = parseUrl(req.url);

  const rawName = typeof item.name === 'string' && item.name.trim() ? item.name : `${method} ${pathTemplate}`;
  const baseOpId = toCamelCase(rawName) || 'request';
  const used = usedOpIds.get(tag) ?? new Set<string>();
  let operationId = baseOpId;
  let i = 2;
  while (used.has(operationId)) operationId = `${baseOpId}${i++}`;
  used.add(operationId);
  usedOpIds.set(tag, used);

  const opBaseName = `${toPascalCase(tag)}${toPascalCase(rawName)}`;
  const { requestBodyType, requestContentType } = extractRequestBody(schemas, opBaseName, req.body, warnings);
  const responseType = extractResponseType(schemas, opBaseName, item.response, warnings);

  return {
    method,
    path: pathTemplate,
    operationId,
    tag,
    summary: typeof req.description === 'string' ? req.description : rawName,
    pathParams,
    queryParams,
    requestBodyType,
    requestContentType,
    responseType,
  };
}

function extractBaseUrl(collection: Json, override?: string): string | undefined {
  if (override) return override;
  const vars: Json[] = Array.isArray(collection.variable) ? collection.variable : [];
  const match = vars.find((v) => typeof v.key === 'string' && /^base_?url$/i.test(v.key));
  return match?.value ? String(match.value) : undefined;
}

export function normalizePostman(rawContent: string, baseUrlOverride?: string): NormalizedSpec {
  const collection = JSON.parse(rawContent);
  if (!Array.isArray(collection.item)) {
    throw new Error('Not a valid Postman Collection (missing "item" array).');
  }

  const schemas = new Map<string, SchemaModel>();
  const endpoints: EndpointModel[] = [];
  const tagOrder: string[] = [];
  const schemasByTag = new Map<string, string[]>();
  const claimedSchemas = new Set<string>();
  const usedOpIds = new Map<string, Set<string>>();
  const warnings: string[] = [];

  function walk(items: Json[], topTag?: string) {
    for (const item of items) {
      if (Array.isArray(item.item)) {
        const nextTag =
          topTag ?? safeIdentifier(item.name ?? 'default', 'Resource').replace(/^./, (c) => c.toLowerCase());
        walk(item.item, nextTag);
        continue;
      }
      if (!item.request) continue;

      const tag = topTag ?? 'default';
      if (!tagOrder.includes(tag)) tagOrder.push(tag);

      const endpoint = buildEndpoint(schemas, tag, item, usedOpIds, warnings);
      if (!endpoint) continue;
      endpoints.push(endpoint);

      const schemaNames = new Set(schemas.keys());
      const refsUsed = [
        ...extractTypeRefs(endpoint.requestBodyType ?? '', schemaNames),
        ...extractTypeRefs(endpoint.responseType, schemaNames),
      ];
      const bucket = schemasByTag.get(tag) ?? [];
      for (const ref of refsUsed) {
        if (claimedSchemas.has(ref)) continue;
        claimedSchemas.add(ref);
        bucket.push(ref);
      }
      schemasByTag.set(tag, bucket);
    }
  }

  walk(collection.item);

  if (!endpoints.length) {
    throw new Error('No GET/POST/PUT/PATCH/DELETE requests found in this Postman Collection.');
  }

  return {
    title: collection.info?.name ?? 'API',
    baseUrl: extractBaseUrl(collection, baseUrlOverride),
    tags: tagOrder,
    schemas,
    endpoints,
    schemasByTag,
    warnings: warnings.length ? warnings : undefined,
  };
}
