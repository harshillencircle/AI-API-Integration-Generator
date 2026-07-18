import type { EndpointModel, NormalizedSpec } from './model';
import type { GeneratedFile } from '../types';
import { toPascalCase } from './naming';
import { extractTypeRefs } from './type-refs';
import { tsTypeToZod } from './zod-from-ts';
import { buildSchemaOwnerMap } from './zod-schemas';

function pathToTemplateLiteral(path: string): string {
  const hasParams = path.includes('{');
  const body = path.replace(/\{([^}]+)\}/g, (_, name) => `\${${name}}`);
  return hasParams ? `\`${body}\`` : `'${body}'`;
}

function buildMethodSignature(ep: EndpointModel): string {
  const args: string[] = [];
  for (const p of ep.pathParams) args.push(`${p.name}: ${p.tsType}`);
  if (ep.requestBodyType) args.push(`body: ${ep.requestBodyType}`);
  if (ep.queryParams.length) {
    const allOptional = ep.queryParams.every((p) => !p.required);
    const fields = ep.queryParams.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.tsType}`).join('; ');
    args.push(`params${allOptional ? '?' : ''}: { ${fields} }`);
  }
  return args.join(', ');
}

/** Zod expression for an endpoint's response, or null if there's no real schema info to validate against. */
function responseZodExpr(ep: EndpointModel, schemaNames: Set<string>): string | null {
  if (ep.responseType === 'void') return null;
  const zodExpr = tsTypeToZod(ep.responseType, schemaNames);
  return zodExpr === 'z.unknown()' ? null : zodExpr;
}

function buildReturn(dataExpr: string, ep: EndpointModel, schemaNames: Set<string>): string {
  const zodExpr = responseZodExpr(ep, schemaNames);
  return zodExpr
    ? `    return validateResponse(${zodExpr}, ${dataExpr}, '${ep.operationId}');`
    : `    return ${dataExpr};`;
}

function buildMethodBody(ep: EndpointModel, schemaNames: Set<string>): string {
  const url = pathToTemplateLiteral(ep.path);
  const configParts: string[] = [];
  if (ep.queryParams.length) configParts.push('params');
  if (ep.requestContentType) {
    configParts.push(`headers: { 'Content-Type': '${ep.requestContentType}' }`);
  }
  const config = configParts.length ? `, { ${configParts.join(', ')} }` : '';
  const isVoid = ep.responseType === 'void';
  const generic = isVoid ? '' : `<${ep.responseType}>`;

  if (ep.method === 'get' || ep.method === 'delete') {
    const call = `apiClient.${ep.method}${generic}(${url}${config})`;
    return isVoid ? `    await ${call};` : `    const { data } = await ${call};\n${buildReturn('data', ep, schemaNames)}`;
  }

  const bodyArg = ep.requestBodyType ? 'body' : 'undefined';
  const call = `apiClient.${ep.method}${generic}(${url}, ${bodyArg}${config})`;
  return isVoid ? `    await ${call};` : `    const { data } = await ${call};\n${buildReturn('data', ep, schemaNames)}`;
}

/** Embeds arbitrary text as a JS template literal, escaping chars that would otherwise break out of it. */
function toJsTemplateLiteral(text: string): string {
  const escaped = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return `\`${escaped}\``;
}

function graphqlDocumentConstName(ep: EndpointModel): string {
  return `${toPascalCase(ep.operationId)}Document`;
}

function buildGraphQLMethodSignature(ep: EndpointModel): string {
  if (!ep.queryParams.length) return '';
  const allOptional = ep.queryParams.every((p) => !p.required);
  const fields = ep.queryParams.map((p) => `${p.name}${p.required ? '' : '?'}: ${p.tsType}`).join('; ');
  return `params${allOptional ? '?' : ''}: { ${fields} }`;
}

/** GraphQL always POSTs a { query, variables } envelope to a single endpoint and unwraps `data.<field>`. */
function buildGraphQLMethodBody(ep: EndpointModel, schemaNames: Set<string>): string {
  const gql = ep.graphql!;
  const docConst = graphqlDocumentConstName(ep);
  const isVoid = ep.responseType === 'void';
  const dataType = isVoid ? 'unknown' : ep.responseType;
  const generic = `<{ data: { ${gql.fieldName}: ${dataType} }; errors?: GraphQLError[] }>`;
  const payload = ep.queryParams.length ? `{ query: ${docConst}, variables: params }` : `{ query: ${docConst} }`;

  const lines = [
    `    const { data } = await apiClient.post${generic}('', ${payload});`,
    `    if (data.errors?.length) throw new ApiError(data.errors[0].message, undefined, 'GRAPHQL_ERROR', data.errors);`,
  ];
  if (!isVoid) lines.push(buildReturn(`data.data.${gql.fieldName}`, ep, schemaNames));
  return lines.join('\n');
}

/** Postman supplies a GraphQL document but not the schema, so preserve the full response envelope. */
function buildPostmanGraphQLMethodSignature(ep: EndpointModel): string {
  return `variables?: ${ep.postmanGraphql!.variablesType}`;
}

function buildPostmanGraphQLMethodBody(ep: EndpointModel, schemaNames: Set<string>): string {
  const url = pathToTemplateLiteral(ep.path);
  const docConst = graphqlDocumentConstName(ep);
  const isVoid = ep.responseType === 'void';
  const generic = isVoid ? '' : `<${ep.responseType}>`;
  const call = `apiClient.post${generic}(${url}, { query: ${docConst}, ...(variables === undefined ? {} : { variables }) })`;
  return isVoid ? `    await ${call};` : `    const { data } = await ${call};\n${buildReturn('data', ep, schemaNames)}`;
}

export function generateServiceFiles(spec: NormalizedSpec): GeneratedFile[] {
  const schemaNames = new Set(spec.schemas.keys());
  const ownerTag = buildSchemaOwnerMap(spec);
  const files: GeneratedFile[] = [];

  const byTag = new Map<string, EndpointModel[]>();
  for (const ep of spec.endpoints) {
    const list = byTag.get(ep.tag) ?? [];
    list.push(ep);
    byTag.set(ep.tag, list);
  }

  for (const [tag, endpoints] of byTag) {
    const className = `${toPascalCase(tag)}Service`;
    const usedTypes = new Set<string>();
    const usesGraphQL = endpoints.some((ep) => ep.graphql);
    if (usesGraphQL) usedTypes.add('GraphQLError');
    for (const ep of endpoints) {
      if (ep.requestBodyType) extractTypeRefs(ep.requestBodyType, schemaNames).forEach((t) => usedTypes.add(t));
      if (ep.responseType) extractTypeRefs(ep.responseType, schemaNames).forEach((t) => usedTypes.add(t));
      for (const p of [...ep.pathParams, ...ep.queryParams]) {
        extractTypeRefs(p.tsType, schemaNames).forEach((t) => usedTypes.add(t));
      }
    }

    let needsZ = false;
    let needsValidate = false;
    const schemaImportsByTag = new Map<string, Set<string>>();
    for (const ep of endpoints) {
      const zodExpr = responseZodExpr(ep, schemaNames);
      if (!zodExpr) continue;
      needsValidate = true;
      if (zodExpr.includes('z.')) needsZ = true;
      for (const ref of extractTypeRefs(ep.responseType, schemaNames)) {
        const owner = ownerTag.get(ref);
        if (!owner) continue;
        const set = schemaImportsByTag.get(owner) ?? new Set<string>();
        set.add(`${ref}Schema`);
        schemaImportsByTag.set(owner, set);
      }
    }
    const needsApiError = usesGraphQL;

    const methods = endpoints.map((ep) => {
      const doc = ep.summary ? `  /** ${ep.summary.replace(/\s+/g, ' ').trim()} */\n` : '';
      const returnType = ep.responseType === 'void' ? 'Promise<void>' : `Promise<${ep.responseType}>`;
      const signature = ep.graphql
        ? buildGraphQLMethodSignature(ep)
        : ep.postmanGraphql
          ? buildPostmanGraphQLMethodSignature(ep)
          : buildMethodSignature(ep);
      const body = ep.graphql
        ? buildGraphQLMethodBody(ep, schemaNames)
        : ep.postmanGraphql
          ? buildPostmanGraphQLMethodBody(ep, schemaNames)
          : buildMethodBody(ep, schemaNames);
      return `${doc}  static async ${ep.operationId}(${signature}): ${returnType} {\n${body}\n  }`;
    });

    const documentConsts = endpoints
      .filter((ep) => ep.graphql || ep.postmanGraphql)
      .map((ep) => {
        const document = ep.graphql?.document ?? ep.postmanGraphql!.document;
        return `const ${graphqlDocumentConstName(ep)} = ${toJsTemplateLiteral(document)};`;
      })
      .join('\n\n');

    const typeImport = usedTypes.size
      ? `import type { ${Array.from(usedTypes).join(', ')} } from '../types/index';\n`
      : '';
    const zImport = needsZ ? `import { z } from 'zod';\n` : '';
    const apiErrorImport = needsApiError ? `import { ApiError } from '../api/errors';\n` : '';
    const validateImport = needsValidate ? `import { validateResponse } from '../api/validate';\n` : '';
    const schemaImports = Array.from(schemaImportsByTag.entries())
      .map(([otherTag, names]) => `import { ${Array.from(names).join(', ')} } from '../validators/${otherTag}.schema';\n`)
      .join('');

    const content =
      `import apiClient from '../api/client';\n${apiErrorImport}${validateImport}${zImport}${schemaImports}${typeImport}\n` +
      (documentConsts ? `${documentConsts}\n\n` : '') +
      `export class ${className} {\n${methods.join('\n\n')}\n}\n`;

    files.push({ path: `services/${tag}.service.ts`, content });
  }

  return files;
}
