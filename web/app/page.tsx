'use client';

import { useState } from 'react';
import JSZip from 'jszip';

type InputMode = 'paste' | 'upload' | 'url';

interface GeneratedFile {
  path: string;
  content: string;
}

interface GenerateResponse {
  files: GeneratedFile[];
  duration: number;
}

const CATEGORIES: { prefix: string; cls: string; dot: string; label: string }[] = [
  { prefix: 'api/', cls: 'cat-api', dot: '#FCD34D', label: 'API infrastructure' },
  { prefix: 'types/', cls: 'cat-type', dot: '#34D399', label: 'TypeScript types' },
  { prefix: 'validators/', cls: 'cat-val', dot: '#FB923C', label: 'Zod validators' },
  { prefix: 'services/', cls: 'cat-svc', dot: '#60A5FA', label: 'Service layer' },
  { prefix: 'hooks/', cls: 'cat-hook', dot: '#A78BFA', label: 'React Query hooks' },
  { prefix: 'mocks/', cls: 'cat-mock', dot: '#E879F9', label: 'MSW mocks' },
  { prefix: 'docs/', cls: 'cat-doc', dot: '#8096B0', label: 'Docs' },
];

function categoryOf(path: string) {
  return CATEGORIES.find((c) => path.startsWith(c.prefix));
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
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSpecText(text);
    setFilename(file.name);
  }

  async function handleGenerate() {
    setError(null);
    setResult(null);
    setLoading(true);
    setActiveTab(0);

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
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
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
    for (const file of result.files) {
      zip.file(file.path, file.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-integration.zip';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.files[activeTab].content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const canGenerate = !loading && (mode === 'url' ? specUrl.trim().length > 0 : specText.trim().length > 0);

  return (
    <>
      <nav>
        <div className="inner">
          <div className="wordmark">
            <div className="wordmark-dot" />
            api-gen
          </div>
          <span className="pill-tag">Template-based · No AI key</span>
        </div>
      </nav>

      <section className="hero">
        <div className="wrap">
          <div className="hero-eyebrow">Run it yourself</div>
          <h1>
            Paste a spec.
            <br />
            <em>Get a typed integration layer.</em>
          </h1>
          <p className="hero-sub">
            Drop in an OpenAPI or Swagger spec below — get Axios services, Zod validators, React
            Query hooks, MSW mocks, and docs generated instantly. Deterministic template-based
            codegen: no AI model, no API key, nothing sent to a third party.
          </p>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 40, paddingBottom: 64 }}>
        <div className="pipeline">
          <div className="pipeline-box input">
            <div className="pb-label">Input</div>
            <div className="pb-note">OpenAPI 3.x or Swagger 2.0, JSON or YAML — paste, upload, or link</div>
          </div>
          <div className="pipeline-arrow">→</div>
          <div className="pipeline-box engine">
            <div className="pb-label">Template engine</div>
            <div className="pb-note">Spec is parsed into a schema model, then walked by deterministic codegen — no network call</div>
          </div>
          <div className="pipeline-arrow">→</div>
          <div className="pipeline-box output">
            <div className="pb-label">Output</div>
            <div className="pb-note">Types, validators, services, hooks, mocks, docs — preview or download as ZIP</div>
          </div>
        </div>

        <div style={{ height: 32 }} />

        <div className="section-title">01 — Spec</div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="mode-toggle">
            <button className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}>
              Paste spec
            </button>
            <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>
              Upload file
            </button>
            <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>
              From URL
            </button>
          </div>

          {mode === 'paste' && (
            <textarea
              className="spec-input"
              placeholder="Paste your OpenAPI 3.x or Swagger 2.0 spec (JSON or YAML) here..."
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
            />
          )}

          {mode === 'upload' && (
            <div>
              <input type="file" accept=".json,.yaml,.yml" onChange={handleFileChange} />
              {specText && (
                <p className="hint" style={{ marginTop: 8 }}>
                  Loaded {filename} — {(specText.length / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          )}

          {mode === 'url' && (
            <input
              style={{ width: '100%' }}
              placeholder="https://api.example.com/openapi.json"
              value={specUrl}
              onChange={(e) => setSpecUrl(e.target.value)}
            />
          )}
        </div>

        <div className="section-title">02 — Options</div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Base URL (optional)</label>
            <input
              placeholder="Override the base URL read from the spec"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        </div>

        <button
          className="btn btn-primary"
          disabled={!canGenerate}
          onClick={handleGenerate}
          style={{ width: '100%', padding: 14, fontSize: 15, fontFamily: 'var(--mono)' }}
        >
          {loading ? 'Generating…' : 'Generate Integration'}
        </button>

        {error && (
          <div className="error-box" style={{ marginTop: 20 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 40 }}>
            <div className="section-title">03 — Output</div>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p className="hint">
                {result.files.length} files generated in {result.duration}ms
              </p>
              <div className="row">
                <button className="btn" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy current file'}
                </button>
                <button className="btn btn-primary" onClick={handleDownloadZip}>
                  Download ZIP
                </button>
              </div>
            </div>

            <div className="file-tree">
              <div className="tree-titlebar">
                <div className="tbar-dot" style={{ background: '#FF5F57' }} />
                <div className="tbar-dot" style={{ background: '#FEBC2E' }} />
                <div className="tbar-dot" style={{ background: '#28C840' }} />
                <span className="tbar-title">generated output</span>
              </div>
              <div className="tabbar scrollx">
                {result.files.map((f, i) => {
                  const cat = categoryOf(f.path);
                  return (
                    <button
                      key={f.path}
                      className={`tab ${cat?.cls ?? ''} ${i === activeTab ? 'active' : ''}`}
                      onClick={() => setActiveTab(i)}
                    >
                      {f.path}
                    </button>
                  );
                })}
              </div>
              <pre className="code-pane scrollx">{result.files[activeTab]?.content}</pre>
            </div>

            <div className="legend">
              {CATEGORIES.map((c) => (
                <div className="legend-item" key={c.prefix}>
                  <div className="legend-dot" style={{ background: c.dot }} />
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer>api-gen · Template-based API Integration Generator</footer>
    </>
  );
}
