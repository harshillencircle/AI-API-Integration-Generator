import { parseSpecContent, formatDisplayName } from '../core/spec';
import { NORMALIZERS, type TemplateSourceFormat } from '../core/template/index';
import { diffSpecs } from '../core/diff';
import type { DiffRequest, DiffResponse } from './types';

/**
 * Compares two spec versions of the same format (both already supported by the
 * template normalizers) and reports added/removed/changed endpoints and schemas.
 * Read-only — never touches generation output.
 */
export async function diffFromRequest(req: DiffRequest): Promise<DiffResponse> {
  const startTime = Date.now();

  const oldSpec = parseSpecContent(req.oldSpecContent, 'old-spec');
  const newSpec = parseSpecContent(req.newSpecContent, 'new-spec');

  if (oldSpec.format === 'unknown' || newSpec.format === 'unknown') {
    throw new Error(
      `Could not detect the spec format for one or both versions. Supported: OpenAPI/Swagger, Postman Collection, GraphQL SDL, GraphQL introspection JSON.`
    );
  }
  if (oldSpec.format !== newSpec.format) {
    throw new Error(
      `Old spec is ${formatDisplayName(oldSpec.format)} but new spec is ${formatDisplayName(newSpec.format)} — both versions must be the same format to compare.`
    );
  }

  const normalize = NORMALIZERS[oldSpec.format as TemplateSourceFormat];
  const oldNormalized = normalize(oldSpec.content, req.baseUrl);
  const newNormalized = normalize(newSpec.content, req.baseUrl);

  const report = diffSpecs(oldNormalized, newNormalized);
  return { ...report, duration: Date.now() - startTime };
}
