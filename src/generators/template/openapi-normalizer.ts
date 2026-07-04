import * as yaml from 'js-yaml';
import { toCamelCase, safeIdentifier, methodNameFromPath } from './naming';
import type {
  EndpointModel,
  HttpMethod,
  NormalizedSpec,
  ParamModel,
  PropertyModel,
  SchemaModel,
} from './model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];
const SUCCESS_CODES = ['200', '201', '202', '204'];

export function parseRawSpec(content: string): Json {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(content);
  }
  return yaml.load(content);
}

function refToName(ref: string): string {
  const last = ref.split('/').pop() ?? ref;
  return safeIdentifier(last, 'Schema');
}

function resolveRef(spec: Json, ref: string): Json | undefined {
  const parts = ref.replace(/^#\//, '').split('/');
  let node = spec;
  for (const part of parts) {
    node = node?.[part];
    if (node === undefined) return undefined;
  }
  return node;
}

interface TsTypeResult {
  tsType: string;
  refName?: string;
}

function safePropName(name: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : `'${name}'`;
}

function schemaToTsType(spec: Json, schema: Json): TsTypeResult {
  if (!schema) return { tsType: 'unknown' };

  if (schema.$ref) {
    const resolved = resolveRef(spec, schema.$ref);
    // If the ref points at something we can't find, still emit the name —
    // it'll show up as a generated interface as long as it was declared.
    const name = refToName(schema.$ref);
    if (!resolved) return { tsType: name, refName: name };
    return { tsType: name, refName: name };
  }

  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((s: Json) => schemaToTsType(spec, s).tsType);
    return { tsType: parts.join(' & ') };
  }
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    const list = schema.oneOf ?? schema.anyOf;
    const parts = list.map((s: Json) => schemaToTsType(spec, s).tsType);
    return { tsType: parts.join(' | ') };
  }

  if (Array.isArray(schema.enum)) {
    const literal = schema.enum
      .map((v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v)))
      .join(' | ');
    return { tsType: schema.enum.length ? literal : 'string' };
  }

  const type = schema.type;

  if (type === 'array' || schema.items) {
    const item = schemaToTsType(spec, schema.items ?? {});
    return { tsType: `${item.tsType}[]`, refName: item.refName };
  }

  if (type === 'object' || schema.properties) {
    const props = Object.entries(schema.properties ?? {});
    if (props.length === 0) {
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const val = schemaToTsType(spec, schema.additionalProperties);
        return { tsType: `Record<string, ${val.tsType}>` };
      }
      return { tsType: 'Record<string, unknown>' };
    }
    const required = new Set<string>(schema.required ?? []);
    const fields = props.map(([key, val]) => {
      const t = schemaToTsType(spec, val as Json);
      const opt = required.has(key) ? '' : '?';
      return `${safePropName(key)}${opt}: ${t.tsType}`;
    });
    return { tsType: `{ ${fields.join('; ')} }` };
  }

  let tsType: string;
  switch (type) {
    case 'string':
      tsType = 'string';
      break;
    case 'integer':
    case 'number':
      tsType = 'number';
      break;
    case 'boolean':
      tsType = 'boolean';
      break;
    default:
      tsType = 'unknown';
  }
  if (schema.nullable) tsType += ' | null';
  return { tsType };
}

function buildSchemaModel(spec: Json, name: string, schema: Json): SchemaModel {
  if (Array.isArray(schema.enum)) {
    return {
      name,
      kind: 'enum',
      enumValues: schema.enum.filter((v: unknown) => typeof v === 'string'),
    };
  }
  if (schema.type === 'object' || schema.properties) {
    const required = new Set<string>(schema.required ?? []);
    const properties: PropertyModel[] = Object.entries(schema.properties ?? {}).map(
      ([key, val]) => {
        const t = schemaToTsType(spec, val as Json);
        return {
          name: key,
          tsType: t.tsType,
          required: required.has(key),
          description: (val as Json)?.description,
        };
      }
    );
    return { name, kind: 'object', properties };
  }
  return { name, kind: 'alias', aliasType: schemaToTsType(spec, schema).tsType };
}

function getDefinitionsMap(spec: Json, isV2: boolean): Record<string, Json> {
  return isV2 ? spec.definitions ?? {} : spec.components?.schemas ?? {};
}

function extractBaseUrl(spec: Json, isV2: boolean, override?: string): string | undefined {
  if (override) return override;
  if (isV2) {
    if (!spec.host) return undefined;
    const scheme = spec.schemes?.[0] ?? 'https';
    return `${scheme}://${spec.host}${spec.basePath ?? ''}`;
  }
  return spec.servers?.[0]?.url;
}

function paramTsType(spec: Json, param: Json, isV2: boolean): string {
  if (isV2) {
    if (param.type === 'array') {
      const itemType = param.items?.type ?? 'string';
      return `${mapPrimitive(itemType)}[]`;
    }
    return mapPrimitive(param.type ?? 'string');
  }
  return schemaToTsType(spec, param.schema ?? {}).tsType;
}

function mapPrimitive(type: string): string {
  switch (type) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function findResponseSchema(spec: Json, responses: Json, isV2: boolean): Json | undefined {
  if (!responses) return undefined;
  for (const code of SUCCESS_CODES) {
    const res = responses[code];
    if (!res) continue;
    if (isV2) {
      if (res.schema) return res.schema;
    } else {
      const content = res.content;
      const media = content?.['application/json'] ?? (content && Object.values(content)[0]);
      if (media && (media as Json).schema) return (media as Json).schema;
    }
  }
  return undefined;
}

export function normalizeOpenApi(rawContent: string, baseUrlOverride?: string): NormalizedSpec {
  const spec = parseRawSpec(rawContent);
  const isV2 = typeof spec.swagger === 'string' && spec.swagger.startsWith('2');
  const isV3 = typeof spec.openapi === 'string' && spec.openapi.startsWith('3');
  if (!isV2 && !isV3) {
    throw new Error(
      'Template mode only supports OpenAPI 3.x or Swagger 2.0 specs (expected an "openapi" or "swagger" field).'
    );
  }

  const definitions = getDefinitionsMap(spec, isV2);
  const schemas = new Map<string, SchemaModel>();
  for (const [rawName, def] of Object.entries(definitions)) {
    const name = safeIdentifier(rawName, 'Schema');
    schemas.set(name, buildSchemaModel(spec, name, def as Json));
  }

  const endpoints: EndpointModel[] = [];
  const tagOrder: string[] = [];
  const schemasByTag = new Map<string, string[]>();
  const claimedSchemas = new Set<string>();

  const paths = spec.paths ?? {};
  for (const [rawPath, pathItem] of Object.entries<Json>(paths)) {
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Json)[method];
      if (!op) continue;

      const tag = safeIdentifier(op.tags?.[0] ?? 'default', 'Resource').replace(/^./, (c) =>
        c.toLowerCase()
      );
      if (!tagOrder.includes(tag)) tagOrder.push(tag);

      const operationId = op.operationId
        ? toCamelCase(op.operationId)
        : methodNameFromPath(method, rawPath);

      const pathParams: ParamModel[] = [];
      const queryParams: ParamModel[] = [];
      let requestBodyType: string | undefined;
      const refsUsed: string[] = [];

      const params: Json[] = op.parameters ?? [];
      for (const param of params) {
        if (param.$ref) continue; // best-effort: skip unresolved shared parameter refs
        if (param.in === 'path') {
          pathParams.push({ name: param.name, tsType: paramTsType(spec, param, isV2), required: true });
        } else if (param.in === 'query') {
          queryParams.push({
            name: param.name,
            tsType: paramTsType(spec, param, isV2),
            required: !!param.required,
          });
        } else if (param.in === 'body') {
          const t = schemaToTsType(spec, param.schema ?? {});
          requestBodyType = t.tsType;
          if (t.refName) refsUsed.push(t.refName);
        }
      }

      if (isV3 && op.requestBody) {
        const content = op.requestBody.content ?? {};
        const media = content['application/json'] ?? Object.values(content)[0];
        if (media && (media as Json).schema) {
          const t = schemaToTsType(spec, (media as Json).schema);
          requestBodyType = t.tsType;
          if (t.refName) refsUsed.push(t.refName);
        }
      }

      const responseSchema = findResponseSchema(spec, op.responses, isV2);
      let responseType = 'void';
      if (responseSchema) {
        const t = schemaToTsType(spec, responseSchema);
        responseType = t.tsType;
        if (t.refName) refsUsed.push(t.refName);
      }

      endpoints.push({
        method,
        path: rawPath,
        operationId,
        tag,
        summary: op.summary,
        pathParams,
        queryParams,
        requestBodyType,
        responseType,
      });

      const bucket = schemasByTag.get(tag) ?? [];
      for (const ref of refsUsed) {
        if (claimedSchemas.has(ref)) continue;
        claimedSchemas.add(ref);
        bucket.push(ref);
      }
      schemasByTag.set(tag, bucket);
    }
  }

  // Any schema no endpoint referenced still needs a home so it isn't silently dropped.
  const leftover = Array.from(schemas.keys()).filter((name) => !claimedSchemas.has(name));
  if (leftover.length) schemasByTag.set('common', [...(schemasByTag.get('common') ?? []), ...leftover]);

  return {
    title: spec.info?.title ?? 'API',
    baseUrl: extractBaseUrl(spec, isV2, baseUrlOverride),
    tags: tagOrder,
    schemas,
    endpoints,
    schemasByTag,
  };
}
