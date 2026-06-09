import { NextResponse } from 'next/server';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const repoRoot = process.cwd();
  const slidesRoot = join(repoRoot, 'slides');
  const requested = normalize(join(slidesRoot, ...path));

  if (!requested.startsWith(slidesRoot + '/') && requested !== slidesRoot) {
    return new NextResponse('forbidden', { status: 403 });
  }

  let target = requested;
  if (existsSync(target) && statSync(target).isDirectory()) {
    target = join(target, 'index.html');
  }

  if (!existsSync(target) || statSync(target).isDirectory()) {
    return new NextResponse('not found', { status: 404 });
  }

  const data = readFileSync(target);
  const ext = extname(target).toLowerCase();
  const type = CONTENT_TYPES[ext] ?? 'application/octet-stream';

  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': type,
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
