import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractReferences, shouldExtract, basenameForOutput } from '../references-extract.js';

let repo: string;
let refs: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'refs-'));
  refs = join(repo, 'slides', 'demo', 'references');
  mkdirSync(refs, { recursive: true });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('shouldExtract', () => {
  it('recognizes supported extensions', () => {
    for (const ext of ['.pdf', '.pptx', '.docx', '.md', '.txt', '.MD', '.PDF']) {
      expect(shouldExtract(`foo${ext}`)).toBe(true);
    }
  });
  it('rejects unsupported extensions', () => {
    for (const f of ['foo.jpg', 'foo.png', 'foo', 'foo.zip', 'foo.xlsx']) {
      expect(shouldExtract(f)).toBe(false);
    }
  });
});

describe('basenameForOutput', () => {
  it('strips extension and extracts stem', () => {
    expect(basenameForOutput('report.final-v2.pdf')).toBe('report.final-v2');
    expect(basenameForOutput('notes.md')).toBe('notes');
  });
});

describe('extractReferences', () => {
  it('returns an empty summary when references/ is missing', async () => {
    // Nothing in references/ dir (we only created demo/references, but empty)
    const r = await extractReferences({ repoRoot: repo, slug: 'demo' });
    expect(r.extracted).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it('returns empty when references/ does not exist for a slide', async () => {
    const r = await extractReferences({ repoRoot: repo, slug: 'no-such-slide' });
    expect(r.extracted).toEqual([]);
  });

  it('passes-through .md files into _extracted/ verbatim', async () => {
    writeFileSync(join(refs, 'notes.md'), '# Hello\n\nPreserved content.');
    const r = await extractReferences({ repoRoot: repo, slug: 'demo' });
    expect(r.extracted).toHaveLength(1);
    expect(r.extracted[0].source).toBe('notes.md');
    const outPath = join(refs, '_extracted', 'notes.md');
    expect(existsSync(outPath)).toBe(true);
    const body = readFileSync(outPath, 'utf8');
    expect(body).toContain('# Hello');
    expect(body).toContain('Preserved content.');
  });

  it('wraps .txt files in markdown with a header', async () => {
    writeFileSync(join(refs, 'snippet.txt'), 'plain text content');
    const r = await extractReferences({ repoRoot: repo, slug: 'demo' });
    expect(r.extracted).toHaveLength(1);
    const body = readFileSync(join(refs, '_extracted', 'snippet.md'), 'utf8');
    expect(body).toMatch(/^# snippet/);
    expect(body).toContain('plain text content');
  });

  it('skips unsupported file types but lists them', async () => {
    writeFileSync(join(refs, 'photo.jpg'), 'binary-ish');
    writeFileSync(join(refs, 'notes.md'), 'x');
    const r = await extractReferences({ repoRoot: repo, slug: 'demo' });
    expect(r.extracted).toHaveLength(1);
    expect(r.skipped.map((s) => s.source)).toContain('photo.jpg');
  });

  it('skips the _extracted/ output dir itself (does not recurse)', async () => {
    mkdirSync(join(refs, '_extracted'), { recursive: true });
    writeFileSync(join(refs, '_extracted', 'stale.md'), 'old');
    writeFileSync(join(refs, 'input.md'), 'new');
    const r = await extractReferences({ repoRoot: repo, slug: 'demo' });
    const sources = r.extracted.map((e) => e.source);
    expect(sources).toContain('input.md');
    expect(sources).not.toContain('stale.md');
  });

  it('writes an _index.md manifest of extracted files', async () => {
    writeFileSync(join(refs, 'a.md'), 'alpha');
    writeFileSync(join(refs, 'b.txt'), 'beta');
    await extractReferences({ repoRoot: repo, slug: 'demo' });
    const index = readFileSync(join(refs, '_extracted', '_index.md'), 'utf8');
    expect(index).toContain('# Extracted references');
    expect(index).toContain('- [a.md](a.md)');
    expect(index).toContain('- [b.txt → b.md](b.md)');
  });

  it('accepts structured output from office parser v6+ (not just a plain string)', async () => {
    // officeparser v6+ returns a nested tree of { type, text, children, content }.
    // Pre-v6 returned a plain string. extractReferences must handle both so the
    // dep can upgrade without silently skipping every PDF/DOCX/PPTX.
    writeFileSync(join(refs, 'report.pdf'), 'binary-pdf-content');
    const v6Response = {
      type: 'pdf',
      content: [
        {
          type: 'page',
          children: [
            { type: 'paragraph', text: 'Hello from page 1' },
            { type: 'paragraph', text: 'Second paragraph' },
          ],
        },
      ],
    };
    const r = await extractReferences({
      repoRoot: repo,
      slug: 'demo',
      // Cast: the public type says string, but production code must accept object too.
      parseOfficeAsync: (async () => v6Response) as unknown as (p: string) => Promise<string>,
    });
    expect(r.extracted).toHaveLength(1);
    const body = readFileSync(join(refs, '_extracted', 'report.md'), 'utf8');
    expect(body).toContain('Hello from page 1');
    expect(body).toContain('Second paragraph');
  });
});
