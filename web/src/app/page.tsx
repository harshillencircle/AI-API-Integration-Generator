'use client';

import { useRef, useState } from 'react';
import JSZip from 'jszip';

type InputMode = 'paste' | 'upload' | 'url';

interface GeneratedFile {
  path: string;
  content: string;
}

interface GenerateResponse {
  files: GeneratedFile[];
  duration: number;
  warnings?: string[];
}

const CATEGORIES: { prefix: string; cls: string; dot: string; label: string }[] = [
  { prefix: 'api/',        cls: 'cat-api',  dot: '#5EEAD4', label: 'API infrastructure' },
  { prefix: 'types/',      cls: 'cat-type', dot: '#34D399', label: 'TypeScript types'   },
  { prefix: 'validators/', cls: 'cat-val',  dot: '#FBBF24', label: 'Zod validators'     },
  { prefix: 'services/',   cls: 'cat-svc',  dot: '#38BDF8', label: 'Service layer'      },
  { prefix: 'hooks/',      cls: 'cat-hook', dot: '#A78BFA', label: 'React Query hooks'  },
  { prefix: 'mocks/',      cls: 'cat-mock', dot: '#F472B6', label: 'MSW mocks'          },
  { prefix: 'docs/',       cls: 'cat-doc',  dot: '#93AECF', label: 'Docs'               },
];

function categoryOf(path: string) {
  return CATEGORIES.find((c) => path.startsWith(c.prefix));
}

const FEATURES: { tag: string; color: string; title: string; desc: string }[] = [
  { tag: 'CLIENT',  color: '#5EEAD4', title: 'API Client',         desc: "Axios client with typed ApiError mapping, 401 refresh hook, exponential retry on 5xx, and bearer-token injection." },
  { tag: 'SERVICE', color: '#38BDF8', title: 'Service Layer',      desc: 'Typed static classes, one per resource/tag, wrapping every endpoint in the spec.' },
  { tag: 'HOOKS',   color: '#A78BFA', title: 'React Query Hooks',  desc: 'useQuery / useMutation hooks per endpoint, plus a shared query-key factory.' },
  { tag: 'TYPES',   color: '#34D399', title: 'TypeScript Types',   desc: 'Interfaces for every request and response shape in the spec — strict, no `any`.' },
  { tag: 'VALID',   color: '#FBBF24', title: 'Zod Validators',     desc: 'Runtime validation schemas mirroring the generated types, one per resource.' },
  { tag: 'MOCKS',   color: '#F472B6', title: 'MSW Mocks',          desc: 'Mock data and request handlers so the frontend can be built before the backend is ready.' },
  { tag: 'DOCS',    color: '#93AECF', title: 'Docs',               desc: 'A generated README describing the output and how to wire it into your app.' },
];

export default function Page() {
  const [mode, setMode]         = useState<InputMode>('paste');
  const [specText, setSpecText] = useState('');
  const [specUrl, setSpecUrl]   = useState('');
  const [filename, setFilename] = useState('spec');
  const [baseUrl, setBaseUrl]   = useState('');

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<GenerateResponse | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied]     = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSpecText(text);
    setFilename(file.name);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
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

      const res  = await fetch('/api/generate', {
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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
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
      {/* ── Nav ── */}
      <nav>
        <div className="inner">
          <div className="wordmark">
            <div className="wordmark-dot" />
            api-gen
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-eyebrow">Run it yourself</div>
          <h1>
            Paste a spec.<br />
            <em>Get a typed integration layer.</em>
          </h1>
          <p className="hero-sub">
            Drop in an OpenAPI / Swagger spec, a Postman Collection, or a GraphQL schema —
            get Axios services, Zod validators, React Query hooks, MSW mocks, and docs
            generated instantly. Deterministic template-based codegen: no AI model, no API key,
            nothing sent to a third party.
          </p>
        </div>
      </section>

      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>

        {/* ── Why this matters ── */}
        <div className="section-title">Why this matters</div>
        <div className="card" style={{ marginBottom: 56 }}>
          <p className="why-copy">
            This is the part of every frontend project nobody wants to redo by hand. The developer pastes
            a Swagger / OpenAPI spec, a Postman Collection, or a GraphQL schema — and instead of manually
            writing <code>users.ts</code>, <code>orders.ts</code>, <code>hooks.ts</code>, and{' '}
            <code>types.ts</code> for every resource, the generator produces the whole integration layer
            in seconds: Axios services, React Query hooks, TypeScript types, error handling, validation,
            a clean folder structure, and API documentation — all in one pass, and reproducible every
            time the spec changes.
          </p>

          <div className="compare-grid">
            <div className="compare-col compare-before">
              <div className="compare-label">Without this — written by hand</div>
              <ul className="compare-list">
                <li><code>users.ts</code>, <code>orders.ts</code> — hand-rolled per resource</li>
                <li><code>hooks.ts</code> — wired up manually per endpoint</li>
                <li><code>types.ts</code> — kept in sync by hand</li>
                <li>Error handling and validation re-invented per resource</li>
                <li>Re-done from scratch every time the API changes</li>
              </ul>
            </div>
            <div className="compare-col compare-after">
              <div className="compare-label">Paste a spec — get all of this</div>
              <ul className="compare-list">
                <li>Axios services, generated per resource/tag</li>
                <li>React Query hooks (useQuery / useMutation) out of the box</li>
                <li>Strict TypeScript types for every request &amp; response</li>
                <li>Built-in error handling and Zod validation</li>
                <li>Consistent folder structure, plus generated API docs</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── Pipeline diagram ── */}
        <div className="pipeline">
          <div className="pipeline-box input">
            <div className="pb-label">Input</div>
            <div className="pb-note">OpenAPI 3.x / Swagger 2.0, Postman Collection, or GraphQL schema — paste, upload, or link</div>
          </div>
          <div className="pipeline-arrow">→</div>
          <div className="pipeline-box engine">
            <div className="pb-label">Template engine</div>
            <div className="pb-note">Spec is parsed into a schema model then walked by deterministic codegen — no network call</div>
          </div>
          <div className="pipeline-arrow">→</div>
          <div className="pipeline-box output">
            <div className="pb-label">Output</div>
            <div className="pb-note">Types, validators, services, hooks, mocks, docs — preview or download as ZIP</div>
          </div>
        </div>

        <div style={{ height: 56 }} />

        {/* ── Capabilities ── */}
        <div className="section-title">What gets generated</div>
        <div className="features-grid" style={{ marginBottom: 56 }}>
          {FEATURES.map((f) => (
            <div className="feat" key={f.title}>
              <div
                className="feat-tag"
                style={{ color: f.color, borderColor: `${f.color}55`, background: `${f.color}14` }}
              >
                {f.tag}
              </div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* ── 01 — Spec + Options combined card ── */}
        <div className="section-title">01 — Spec</div>
        <div className="card" style={{ marginBottom: 16 }}>

          {/* Mode toggle */}
          <div className="mode-toggle">
            <button className={mode === 'paste'  ? 'active' : ''} onClick={() => setMode('paste')}>Paste spec</button>
            <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>Upload file</button>
            <button className={mode === 'url'    ? 'active' : ''} onClick={() => setMode('url')}>From URL</button>
          </div>

          {/* Paste mode */}
          {mode === 'paste' && (
            <textarea
              className="spec-input"
              placeholder="Paste your OpenAPI / Swagger spec, Postman Collection, or GraphQL schema here…"
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
            />
          )}

          {/* Upload mode */}
          {mode === 'upload' && (
            <div>
              {/* Truly hidden input — no visual artifacts */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.yaml,.yml,.graphql,.gql"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <div
                className={`upload-zone${dragging ? ' dragging' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <span className="upload-icon">{dragging ? '⬇️' : '📂'}</span>
                <p className="upload-text">{dragging ? 'Drop it here!' : 'Click to choose a file, or drag & drop'}</p>
                <p className="upload-hint">.json · .yaml · .yml · .graphql · .gql</p>
              </div>
              {specText && (
                <div className="upload-loaded">
                  <span>✓</span>
                  <span>{filename} — {(specText.length / 1024).toFixed(1)} KB loaded</span>
                </div>
              )}
            </div>
          )}

          {/* URL mode */}
          {mode === 'url' && (
            <input
              placeholder="https://api.example.com/openapi.json"
              value={specUrl}
              onChange={(e) => setSpecUrl(e.target.value)}
            />
          )}

        </div>

        {/* ── Generate button ── */}
        <button
          className={`btn btn-primary btn-generate${loading ? ' btn-loading' : ''}`}
          disabled={!canGenerate}
          onClick={handleGenerate}
        >
          {loading ? '⚙  Generating…' : '⚡  Generate Integration'}
        </button>

        {/* ── Error ── */}
        {error && (
          <div className="error-box" style={{ marginTop: 20 }}>
            {error}
          </div>
        )}

        {/* ── Output ── */}
        {result && (
          <div className="result-anim" style={{ marginTop: 48 }}>
            <div className="section-title">02 — Output</div>

            <div className="output-meta">
              <div className="output-stat">
                <span className="stat-badge">✓ {result.files.length} files</span>
                <span>generated in {result.duration} ms</span>
                {result.warnings && result.warnings.length > 0 && (
                  <span className="stat-badge" style={{ marginLeft: 8, color: '#FBBF24' }}>
                    ⚠ {result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="row">
                <button className="btn" onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy file'}
                </button>
                <button className="btn btn-primary" onClick={handleDownloadZip}>
                  ↓ Download ZIP
                </button>
              </div>
            </div>

            {result.warnings && result.warnings.length > 0 && (
              <div className="error-box" style={{ marginTop: 16, borderColor: '#FBBF2455', color: '#FDE68A' }}>
                <strong>Normalization warnings</strong>
                <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="file-tree">
              <div className="tree-titlebar">
                <div className="tbar-dot" style={{ background: '#FF5F57' }} />
                <div className="tbar-dot" style={{ background: '#FEBC2E' }} />
                <div className="tbar-dot" style={{ background: '#28C840' }} />
                <span className="tbar-title">generated output</span>
              </div>

              <div className="tabbar-row">
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
                <button
                  className="tab-copy-btn"
                  onClick={handleCopy}
                  title={`Copy ${result.files[activeTab]?.path}`}
                >
                  {copied ? '✓' : '⧉'}
                </button>
              </div>

              <pre className="code-pane scrollx">{result.files[activeTab]?.content}</pre>
            </div>

            <div className="legend">
              {CATEGORIES.map((c) => (
                <div className="legend-item" key={c.prefix}>
                  <div className="legend-dot" style={{ background: c.dot, color: c.dot }} />
                  {c.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer>api-gen · Integration Generator</footer>
    </>
  );
}