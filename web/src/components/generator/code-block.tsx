import { Fragment } from 'react';

const KEYWORDS = new Set([
  'import', 'export', 'from', 'const', 'let', 'var', 'function', 'return', 'interface',
  'type', 'extends', 'implements', 'class', 'new', 'this', 'if', 'else', 'for', 'while',
  'async', 'await', 'try', 'catch', 'throw', 'default', 'as', 'in', 'of', 'typeof',
  'public', 'private', 'readonly', 'enum', 'void', 'null', 'undefined', 'true', 'false',
  'switch', 'case', 'break', 'continue', 'static', 'get', 'set', 'yield',
]);

const TOKEN_RE =
  /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([{}()[\];:,.<>=+\-*/!&|?%~^]+)/g;

function tokenClass(match: RegExpMatchArray): string {
  const [, comment, blockComment, str, num, word] = match;
  if (comment || blockComment) return 'text-[var(--muted-foreground)] italic';
  if (str) return 'text-[var(--color-green)]';
  if (num) return 'text-[var(--color-amber)]';
  if (word) {
    if (KEYWORDS.has(word)) return 'text-[var(--color-purple)] font-medium';
    if (/^[A-Z]/.test(word)) return 'text-[var(--color-blue)]';
    return 'text-[var(--foreground-2)]';
  }
  return 'text-[var(--muted-foreground)]';
}

function highlightLine(line: string, key: number) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  let i = 0;
  while ((m = TOKEN_RE.exec(line))) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    parts.push(
      <span key={`${key}-${i++}`} className={tokenClass(m)}>
        {m[0]}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return <Fragment key={key}>{parts.length ? parts : line || ' '}</Fragment>;
}

export function CodeBlock({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <pre className="scrollx max-h-[500px] overflow-auto bg-[var(--card-solid)] p-5 font-mono text-[12.5px] leading-relaxed">
      <code>
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="mr-4 w-8 shrink-0 select-none text-right text-[var(--muted-foreground)]/50">
              {i + 1}
            </span>
            <span className="whitespace-pre">{highlightLine(line, i)}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}
