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

interface SelectionResult {
  selection: string;
  warnings: string[];
}

/**
 * Auto-generated field selection for query/mutation documents. Scalars and enums are
 * selected directly, object/interface fields recurse up to a depth limit, union fields
 * emit inline fragments, and fields requiring arguments are skipped with a warning.
 */
function buildSelectionSet(
  type: Json,
  depth: number,
  visited: Set<string>,
  typePath = ''
): SelectionResult {
  const warnings: string[] = [];
  const named: Json = getNamedType(type as GraphQLOutputType);
  if (isScalarType(named) || isEnumType(named)) return { selection: '', warnings };
  if (depth <= 0) {
    warnings.push(`Selection depth limit reached${typePath ? ` at ${typePath}` : ''}; using __typename only`);
    return { selection: '{ __typename }', warnings };
  }
  if (visited.has(named.name)) return { selection: '{ __typename }', warnings };

  const nextVisited = new Set(visited);
  nextVisited.add(named.name);

  // A root operation may itself return a union, not only a field on an object.
  // Handle it before checking getFields(), because GraphQLUnionType has no fields.
  if (isUnionType(named)) {
    const fragments: string[] = [];
    for (const member of named.getTypes() as Json[]) {
      if (!isObjectType(member) && !isInterfaceType(member)) continue;
      const sub = buildSelectionSet(member, depth - 1, nextVisited, `${typePath}.${member.name}`);
      warnings.push(...sub.warnings);
      if (sub.selection) fragments.push(`... on ${member.name} ${sub.selection}`);
    }
    if (fragments.length) return { selection: `{ ${fragments.join(' ')} }`, warnings };
    warnings.push(`Skipped union '${named.name}' (no selectable member fields)`);
    return { selection: '{ __typename }', warnings };
  }

  if (typeof named.getFields !== 'function') return { selection: '{ __typename }', warnings };

  const parts: string[] = [];
  let skippedArgCount = 0;
  let skippedUnionCount = 0;

  for (const field of Object.values(named.getFields()) as Json[]) {
    if (field.name.startsWith('__')) continue;

    const fieldPath = typePath ? `${typePath}.${field.name}` : `${named.name}.${field.name}`;

    if (field.args?.length) {
      const argNames = (field.args as Json[]).map((a) => a.name).join(', ');
      warnings.push(`Skipped field '${field.name}' on type '${named.name}' (requires arguments: ${argNames})`);
      skippedArgCount++;
      continue;
    }

    const fieldNamed: Json = getNamedType(field.type as GraphQLOutputType);
    if (isScalarType(fieldNamed) || isEnumType(fieldNamed)) {
      parts.push(field.name);
    } else if (isObjectType(fieldNamed) || isInterfaceType(fieldNamed)) {
      const sub = buildSelectionSet(field.type, depth - 1, nextVisited, fieldPath);
      warnings.push(...sub.warnings);
      if (sub.selection) parts.push(`${field.name} ${sub.selection}`);
    } else if (isUnionType(fieldNamed)) {
      const members = (fieldNamed.getTypes() as Json[]) ?? [];
      const fragments: string[] = [];
      for (const member of members) {
        if (!isObjectType(member) && !isInterfaceType(member)) continue;
        const sub = buildSelectionSet(member, depth - 1, nextVisited, `${fieldPath}.${member.name}`);
        warnings.push(...sub.warnings);
        if (sub.selection) fragments.push(`... on ${member.name} ${sub.selection}`);
      }
      if (fragments.length) {
        parts.push(`${field.name} { ${fragments.join(' ')} }`);
      } else {
        warnings.push(`Skipped union field '${field.name}' on type '${named.name}' (no selectable member fields)`);
        skippedUnionCount++;
      }
    }
  }

  if (!parts.length) {
    if (skippedArgCount || skippedUnionCount) {
      warnings.push(
        `Incomplete selection for type '${named.name}'${typePath ? ` (${typePath})` : ''}; falling back to __typename`
      );
    }
    return { selection: '{ __typename }', warnings };
  }

  return { selection: `{ ${parts.join(' ')} }`, warnings };
}

function buildDocument(
  operationType: 'query' | 'mutation',
  operationName: string,
  fieldName: string,
  args: Json[],
  returnType: Json
): { document: string; warnings: string[] } {
  const argsSDL = args.length ? `(${args.map((a) => `$${a.name}: ${String(a.type)}`).join(', ')})` : '';
  const fieldArgs = args.length ? `(${args.map((a) => `${a.name}: $${a.name}`).join(', ')})` : '';
  const { selection, warnings } = buildSelectionSet(returnType, SELECTION_DEPTH, new Set());
  const fieldLine = selection ? `${fieldName}${fieldArgs} ${selection}` : `${fieldName}${fieldArgs}`;
  const document = `${operationType} ${operationName}${argsSDL} {\n  ${fieldLine}\n}`;
  return { document, warnings };
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
  const warnings: string[] = [];

  function walkRoot(rootType: Json | null | undefined, operationType: 'query' | 'mutation', tag: string) {
    if (!rootType) return;
    tagOrder.push(tag);
    const bucket: string[] = [];

    for (const field of Object.values(rootType.getFields()) as Json[]) {
      const operationName = toPascalCase(field.name);
      const args: Json[] = field.args ?? [];
      const { document, warnings: docWarnings } = buildDocument(operationType, operationName, field.name, args, field.type);
      const responseType = graphqlTypeToTs(field.type);
      if (docWarnings.length) warnings.push(...docWarnings.map((w) => `[${operationName}] ${w}`));

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
        graphql: {
          operationType,
          operationName,
          document,
          fieldName: field.name,
          warnings: docWarnings.length ? docWarnings : undefined,
        },
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
    warnings: warnings.length ? warnings : undefined,
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
