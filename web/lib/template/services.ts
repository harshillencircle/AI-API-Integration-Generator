import type { EndpointModel, NormalizedSpec } from './model';
import type { GeneratedFile } from '../types';
import { toPascalCase } from './naming';
import { extractTypeRefs } from './type-refs';

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

function buildMethodBody(ep: EndpointModel): string {
  const url = pathToTemplateLiteral(ep.path);
  const config = ep.queryParams.length ? ', { params }' : '';
  const isVoid = ep.responseType === 'void';
  const generic = isVoid ? '' : `<${ep.responseType}>`;

  if (ep.method === 'get' || ep.method === 'delete') {
    const call = `apiClient.${ep.method}${generic}(${url}${config})`;
    return isVoid ? `    await ${call};` : `    const { data } = await ${call};\n    return data;`;
  }

  const bodyArg = ep.requestBodyType ? 'body' : 'undefined';
  const call = `apiClient.${ep.method}${generic}(${url}, ${bodyArg}${config})`;
  return isVoid ? `    await ${call};` : `    const { data } = await ${call};\n    return data;`;
}

export function generateServiceFiles(spec: NormalizedSpec): GeneratedFile[] {
  const schemaNames = new Set(spec.schemas.keys());
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
    for (const ep of endpoints) {
      if (ep.requestBodyType) extractTypeRefs(ep.requestBodyType, schemaNames).forEach((t) => usedTypes.add(t));
      if (ep.responseType) extractTypeRefs(ep.responseType, schemaNames).forEach((t) => usedTypes.add(t));
      for (const p of [...ep.pathParams, ...ep.queryParams]) {
        extractTypeRefs(p.tsType, schemaNames).forEach((t) => usedTypes.add(t));
      }
    }

    const methods = endpoints.map((ep) => {
      const doc = ep.summary ? `  /** ${ep.summary.replace(/\s+/g, ' ').trim()} */\n` : '';
      const returnType = ep.responseType === 'void' ? 'Promise<void>' : `Promise<${ep.responseType}>`;
      return `${doc}  static async ${ep.operationId}(${buildMethodSignature(ep)}): ${returnType} {\n${buildMethodBody(ep)}\n  }`;
    });

    const typeImport = usedTypes.size
      ? `import type { ${Array.from(usedTypes).join(', ')} } from '../types/index';\n`
      : '';

    const content =
      `import apiClient from '../api/client';\n${typeImport}\n` +
      `export class ${className} {\n${methods.join('\n\n')}\n}\n`;

    files.push({ path: `services/${tag}.service.ts`, content });
  }

  return files;
}
