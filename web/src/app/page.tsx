'use client';

import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { Nav } from '@/components/generator/nav';
import { Hero, SectionTitle, Footer } from '@/components/generator/hero';
import { SpecInputPanel, type InputMode } from '@/components/generator/spec-input-panel';
import { OutputBrowser } from '@/components/generator/output-browser';
import { WhyMatters } from '@/components/generator/why-matters';
import { PipelineDiagram } from '@/components/generator/pipeline-diagram';
import { FeaturesGrid } from '@/components/generator/features-grid';
import { DiffPanel } from '@/components/generator/diff-panel';
import { loadStored, saveStored } from '@/lib/storage';

interface GeneratedFile {
  path: string;
  content: string;
}

interface GenerateResponse {
  files: GeneratedFile[];
  duration: number;
  warnings?: string[];
}

export default function Page() {
  const [mode, setMode] = useState<InputMode>('paste');
  const [specText, setSpecText] = useState('');
  const [specUrl, setSpecUrl] = useState('');
  const [filename, setFilename] = useState('spec');
  const [baseUrl, setBaseUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMode(loadStored('mode', 'paste' as InputMode));
    setSpecText(loadStored('specText', ''));
    setSpecUrl(loadStored('specUrl', ''));
    setFilename(loadStored('filename', 'spec'));
    setBaseUrl(loadStored('baseUrl', ''));
    setResult(loadStored<GenerateResponse | null>('result', null));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveStored('mode', mode);
    saveStored('specText', specText);
    saveStored('specUrl', specUrl);
    saveStored('filename', filename);
    saveStored('baseUrl', baseUrl);
  }, [hydrated, mode, specText, specUrl, filename, baseUrl]);

  useEffect(() => {
    if (!hydrated) return;
    saveStored('result', result);
  }, [hydrated, result]);

  async function handleGenerate() {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        baseUrl: baseUrl || undefined,
        filename,
      };
      if (mode === 'url') {
        body.specUrl = specUrl;
      } else {
        body.specContent = specText;
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult(data as GenerateResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadZip() {
    if (!result) return;
    const zip = new JSZip();
    for (const file of result.files) zip.file(file.path, file.content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-integration.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  const canGenerate = !loading && (mode === 'url' ? specUrl.trim().length > 0 : specText.trim().length > 0);

  return (
    <>
      <Nav />
      <Hero />

      <div className="mx-auto max-w-[960px] px-6 pt-6 pb-20">
        <SectionTitle>01 — Spec</SectionTitle>
        <SpecInputPanel
          mode={mode}
          setMode={setMode}
          specText={specText}
          setSpecText={setSpecText}
          specUrl={specUrl}
          setSpecUrl={setSpecUrl}
          filename={filename}
          setFilename={setFilename}
          baseUrl={baseUrl}
          setBaseUrl={setBaseUrl}
          loading={loading}
          error={error}
          canGenerate={canGenerate}
          onGenerate={handleGenerate}
        />

        {result && (
          <div className="mt-10">
            <SectionTitle>02 — Output</SectionTitle>
            <OutputBrowser result={result} onDownloadZip={handleDownloadZip} />
          </div>
        )}

        <div className="h-14" />

        <SectionTitle>Why this matters</SectionTitle>
        <WhyMatters />

        <PipelineDiagram />

        <div className="h-14" />

        <SectionTitle>What gets generated</SectionTitle>
        <div className="mb-14">
          <FeaturesGrid />
        </div>

        <DiffPanel />
      </div>

      <Footer />
    </>
  );
}
