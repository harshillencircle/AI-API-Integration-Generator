export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface ParamModel {
  name: string;
  tsType: string;
  required: boolean;
}

/**
 * Present only for endpoints synthesized from a GraphQL schema. GraphQL has a single
 * HTTP endpoint and no REST-style path/method — services.ts branches on this field to
 * emit a POST-with-query-document call instead of the REST url/method call.
 */
export interface GraphQLOperationModel {
  operationType: 'query' | 'mutation';
  operationName: string; // PascalCase, used as the GraphQL operation name, e.g. "GetUser"
  document: string; // full query/mutation document text, incl. an auto-selected field set
  fieldName: string; // root Query/Mutation field this operation calls, e.g. "user"
}

export interface EndpointModel {
  method: HttpMethod;
  path: string; // raw spec path, e.g. /pets/{id}; empty string for GraphQL endpoints
  operationId: string; // camelCase, unique
  tag: string;
  summary?: string;
  pathParams: ParamModel[];
  queryParams: ParamModel[]; // also used for GraphQL variables when `graphql` is set
  requestBodyType?: string; // TS type expression, e.g. "Pet" or "{ name: string }"
  responseType: string; // TS type expression, "void" if none found
  graphql?: GraphQLOperationModel;
}

export type SchemaKind = 'object' | 'enum' | 'alias';

export interface PropertyModel {
  name: string;
  tsType: string;
  required: boolean;
  description?: string;
}

export interface SchemaModel {
  name: string; // PascalCase
  kind: SchemaKind;
  properties?: PropertyModel[]; // kind === 'object'
  enumValues?: string[]; // kind === 'enum'
  aliasType?: string; // kind === 'alias' (arrays, primitives-with-a-name)
}

export interface NormalizedSpec {
  title: string;
  baseUrl?: string;
  tags: string[];
  schemas: Map<string, SchemaModel>;
  endpoints: EndpointModel[];
  /** schema names referenced by each tag's endpoints, in first-use order */
  schemasByTag: Map<string, string[]>;
}
