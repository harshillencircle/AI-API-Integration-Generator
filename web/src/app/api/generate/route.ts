import { NextRequest, NextResponse } from 'next/server';
import { generateFromRequest } from '@/lib/generate';
import type { GenerateRequest } from '@/lib/types';

// Template generation is synchronous string processing, not an AI call —
// this should always finish in well under a second, but keep headroom for
// very large specs.
export const maxDuration = 15;

const MAX_SPEC_BYTES = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  let body: Partial<GenerateRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { specContent, specUrl, filename, baseUrl } = body;

  if (!specContent && !specUrl) {
    return NextResponse.json(
      { error: 'Provide either specContent (pasted/uploaded text) or specUrl.' },
      { status: 400 }
    );
  }
  if (specContent && typeof specContent === 'string' && Buffer.byteLength(specContent, 'utf-8') > MAX_SPEC_BYTES) {
    return NextResponse.json({ error: 'Spec is too large (2MB limit).' }, { status: 413 });
  }

  try {
    const result = await generateFromRequest({ specContent, specUrl, filename, baseUrl });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
