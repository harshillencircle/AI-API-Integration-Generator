export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface ParamModel {
  name: string;
  tsType: string;
  required: boolean;
}

export interface EndpointModel {
  method: HttpMethod;
  path: string; // raw spec path, e.g. /pets/{id}
  operationId: string; // camelCase, unique
  tag: string;
  summary?: string;
  pathParams: ParamModel[];
  queryParams: ParamModel[];
  requestBodyType?: string; // TS type expression, e.g. "Pet" or "{ name: string }"
  responseType: string; // TS type expression, "void" if none found
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
