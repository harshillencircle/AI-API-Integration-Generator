import { NextRequest, NextResponse } from 'next/server';
import { diffFromRequest } from '@/lib/diff-request';
import type { DiffRequest } from '@/lib/types';

// Diffing is synchronous string/object processing, same cost profile as /api/generate.
export const maxDuration = 15;

const MAX_SPEC_BYTES = 2 * 1024 * 1024; // 2MB, matches /api/generate's cap

export async function POST(request: NextRequest) {
  let body: Partial<DiffRequest>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { oldSpecContent, newSpecContent, baseUrl } = body;

  if (!oldSpecContent || !newSpecContent) {
    return NextResponse.json(
      { error: 'Provide both oldSpecContent and newSpecContent to compare.' },
      { status: 400 }
    );
  }
  if (Buffer.byteLength(oldSpecContent, 'utf-8') > MAX_SPEC_BYTES || Buffer.byteLength(newSpecContent, 'utf-8') > MAX_SPEC_BYTES) {
    return NextResponse.json({ error: 'One of the specs is too large (2MB limit).' }, { status: 413 });
  }

  try {
    const result = await diffFromRequest({ oldSpecContent, newSpecContent, baseUrl });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
