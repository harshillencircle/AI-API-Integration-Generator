import {
  buildSchema,
  buildClientSchema,
  getNamedType,
  isScalarType,
  isEnumType,
  isObjectType,
  isInputObjectType,
  isInterfaceType,
  isUnionType,
  isListType,
  isNonNullType,
  type GraphQLOutputType,
  type GraphQLSchema,
} from 'graphql';
import { toCamelCase, toPascalCase } from './naming';
import { extractTypeRefs } from './type-refs';
import type { EndpointModel, NormalizedSpec, ParamModel, PropertyModel, SchemaModel } from './model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const SELECTION_DEPTH = 3;

function scalarToTs(name: string): string {
  switch (name) {
    case 'Int':
    case 'Float':
      return 'number';
    case 'Boolean':
      return 'boolean';
    default:
      return 'string'; // ID, String, and any custom scalar (DateTime, JSON, ...) — best-effort default
  }
}

/**
 * Converts a GraphQL output/input type into a TS type expression. Nullability is
 * modeled precisely (unlike the OpenAPI normalizer, which drops it on array types) —
 * `[String]` becomes `(string | null)[] | null`. See stripOuterParens() in
 * zod-from-ts.ts for why the parens around a unioned array item are required.
 */
function graphqlTypeToTs(type: Json): string {
  const isNonNull = isNonNullType(type);
  const bare = isNonNull ? type.ofType : type;

  if (isListType(bare)) {
    const itemType = graphqlTypeToTs(bare.ofType);
    const arrayOf = itemType.includes(' | ') ? `(${itemType})` : itemType;
    const arr = `${arrayOf}[]`;
    return isNonNull ? arr : `${arr} | null`;
  }

  const base = isScalarType(bare) ? scalarToTs(bare.name) : bare.name;
  return isNonNull ? base : `${base} | null`;
}

/**
 * Best-effort field selection for an auto-generated query/mutation document: scalars
 * and enums are selected directly, object/interface fields recurse up to a depth limit,
 * fields that require their own arguments are skipped (we have no value to supply), and
 * unions are skipped (would need per-type inline fragments). depth + visited together
 * guard against runaway recursion on self-referential types (e.g. Comment.replies).
 */
function buildSelectionSet(type: Json, depth: number, visited: Set<string>): string {
  const named: Json = getNamedType(type as GraphQLOutputType);
  if (isScalarType(named) || isEnumType(named)) return '';
  if (typeof named.getFields !== 'function') return '{ __typename }';
  if (depth <= 0 || visited.has(named.name)) return '{ __typename }';

  const nextVisited = new Set(visited);
  nextVisited.add(named.name);

  const parts: string[] = [];
  for (const field of Object.values(named.getFields()) as Json[]) {
    if (field.name.startsWith('__') || field.args?.length) continue;
    const fieldNamed: Json = getNamedType(field.type as GraphQLOutputType);
    if (isScalarType(fieldNamed) || isEnumType(fieldNamed)) {
      parts.push(field.name);
    } else if (isObjectType(fieldNamed) || isInterfaceType(fieldNamed)) {
      const sub = buildSelectionSet(field.type, depth - 1, nextVisited);
      if (sub) parts.push(`${field.name} ${sub}`);
    }
  }

  return parts.length ? `{ ${parts.join(' ')} }` : '{ __typename }';
}

function buildDocument(
  operationType: 'query' | 'mutation',
  operationName: string,
  fieldName: string,
  args: Json[],
  returnType: Json
): string {
  const argsSDL = args.length ? `(${args.map((a) => `$${a.name}: ${String(a.type)}`).join(', ')})` : '';
  const fieldArgs = args.length ? `(${args.map((a) => `${a.name}: $${a.name}`).join(', ')})` : '';
  const selection = buildSelectionSet(returnType, SELECTION_DEPTH, new Set());
  const fieldLine = selection ? `${fieldName}${fieldArgs} ${selection}` : `${fieldName}${fieldArgs}`;
  return `${operationType} ${operationName}${argsSDL} {\n  ${fieldLine}\n}`;
}

function registerNamedTypes(schema: GraphQLSchema, rootNames: Set<string>): Map<string, SchemaModel> {
  const schemas = new Map<string, SchemaModel>();

  for (const [name, type] of Object.entries(schema.getTypeMap())) {
    if (name.startsWith('__') || rootNames.has(name) || isScalarType(type as Json)) continue;

    if (isEnumType(type as Json)) {
      const enumValues = (type as Json).getValues().map((v: Json) => v.name);
      schemas.set(name, { name, kind: 'enum', enumValues });
      continue;
    }

    if (isObjectType(type as Json) || isInputObjectType(type as Json) || isInterfaceType(type as Json)) {
      const fields = (type as Json).getFields();
      const properties: PropertyModel[] = Object.values(fields).map((f: Json) => ({
        name: f.name,
        tsType: graphqlTypeToTs(f.type),
        required: isNonNullType(f.type),
        description: typeof f.description === 'string' ? f.description : undefined,
      }));
      schemas.set(name, { name, kind: 'object', properties });
      continue;
    }

    if (isUnionType(type as Json)) {
      const members = (type as Json).getTypes().map((t: Json) => t.name);
      schemas.set(name, { name, kind: 'alias', aliasType: members.length ? members.join(' | ') : 'unknown' });
    }
  }

  schemas.set('GraphQLError', {
    name: 'GraphQLError',
    kind: 'object',
    properties: [
      { name: 'message', tsType: 'string', required: true },
      { name: 'path', tsType: 'string[]', required: false },
      { name: 'extensions', tsType: 'Record<string, unknown>', required: false },
    ],
  });

  return schemas;
}

function buildNormalizedSpecFromSchema(schema: GraphQLSchema, baseUrlOverride?: string): NormalizedSpec {
  const queryType = schema.getQueryType();
  const mutationType = schema.getMutationType();
  const rootNames = new Set(
    [queryType?.name, mutationType?.name, schema.getSubscriptionType()?.name].filter(Boolean) as string[]
  );

  const schemas = registerNamedTypes(schema, rootNames);
  const schemaNames = new Set(schemas.keys());

  const endpoints: EndpointModel[] = [];
  const tagOrder: string[] = [];
  const schemasByTag = new Map<string, string[]>();
  const claimedSchemas = new Set<string>();

  function walkRoot(rootType: Json | null | undefined, operationType: 'query' | 'mutation', tag: string) {
    if (!rootType) return;
    tagOrder.push(tag);
    const bucket: string[] = [];

    for (const field of Object.values(rootType.getFields()) as Json[]) {
      const operationName = toPascalCase(field.name);
      const args: Json[] = field.args ?? [];
      const document = buildDocument(operationType, operationName, field.name, args, field.type);
      const responseType = graphqlTypeToTs(field.type);

      const queryParams: ParamModel[] = args.map((a) => ({
        name: a.name,
        tsType: graphqlTypeToTs(a.type),
        required: isNonNullType(a.type),
      }));

      endpoints.push({
        method: operationType === 'query' ? 'get' : 'post',
        path: '',
        operationId: toCamelCase(field.name),
        tag,
        summary: typeof field.description === 'string' ? field.description : field.name,
        pathParams: [],
        queryParams,
        requestBodyType: undefined,
        responseType,
        graphql: { operationType, operationName, document, fieldName: field.name },
      });

      const directRefs = [
        ...extractTypeRefs(responseType, schemaNames),
        ...queryParams.flatMap((p) => extractTypeRefs(p.tsType, schemaNames)),
      ];
      for (const ref of directRefs) {
        if (claimedSchemas.has(ref)) continue;
        claimedSchemas.add(ref);
        bucket.push(ref);
      }
    }

    schemasByTag.set(tag, bucket);
  }

  walkRoot(queryType, 'query', 'queries');
  walkRoot(mutationType, 'mutation', 'mutations');

  if (!endpoints.length) {
    throw new Error('No Query or Mutation fields found in this GraphQL schema.');
  }

  // Types only reachable transitively (e.g. User.posts -> Post, never an endpoint's own
  // top-level request/response type) still need a validator file — same "common" catch-all
  // the OpenAPI normalizer uses for its own unclaimed component schemas.
  const leftover = Array.from(schemas.keys()).filter((name) => !claimedSchemas.has(name));
  if (leftover.length) {
    schemasByTag.set('common', [...(schemasByTag.get('common') ?? []), ...leftover]);
  }

  return {
    title: 'GraphQL API',
    baseUrl: baseUrlOverride,
    tags: tagOrder,
    schemas,
    endpoints,
    schemasByTag,
  };
}

export function normalizeGraphQLSDL(rawContent: string, baseUrlOverride?: string): NormalizedSpec {
  const schema = buildSchema(rawContent, { assumeValidSDL: true });
  return buildNormalizedSpecFromSchema(schema, baseUrlOverride);
}

export function normalizeGraphQLIntrospection(rawContent: string, baseUrlOverride?: string): NormalizedSpec {
  const parsed = JSON.parse(rawContent);
  const introspection = parsed.data ?? parsed;
  const schema = buildClientSchema(introspection);
  return buildNormalizedSpecFromSchema(schema, baseUrlOverride);
}
