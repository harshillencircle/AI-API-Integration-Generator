import { parseSpecContent, formatDisplayName } from '../core/spec';
import { generateTemplateFiles } from '../core/template/index';
import type { GenerateRequest, GenerateResponse } from './types';

/**
 * Runs a single spec → template-based generation for one request.
 * Deterministic, no AI, no API key, no filesystem access.
 */
export async function generateFromRequest(req: GenerateRequest): Promise<GenerateResponse> {
  const startTime = Date.now();

  let content = req.specContent;
  let filename = req.filename;
  if (!content && req.specUrl) {
    const res = await fetch(req.specUrl);
    if (!res.ok) throw new Error(`Failed to fetch spec from URL: ${res.status} ${res.statusText}`);
    content = await res.text();
    filename = filename ?? new URL(req.specUrl).pathname.split('/').pop() ?? 'spec';
  }
  if (!content) throw new Error('No spec content or URL provided.');

  const spec = parseSpecContent(content, filename);
  if (spec.format === 'unknown') {
    throw new Error(
      `Could not detect the spec format. Supported: OpenAPI/Swagger, Postman Collection, GraphQL SDL, GraphQL introspection JSON. Detected: ${formatDisplayName(spec.format)}.`
    );
  }

  const { files, warnings } = generateTemplateFiles(spec.content, spec.format, req.baseUrl);
  return { files, duration: Date.now() - startTime, warnings };
}
