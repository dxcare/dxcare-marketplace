import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SlideSummary } from '@/lib/meta-aggregator';

interface AggregateFile {
  generated_at: string;
  slides: SlideSummary[];
}

function loadAggregate(): AggregateFile {
  const path = join(process.cwd(), 'public', 'slides-meta.json');
  if (!existsSync(path)) return { generated_at: new Date().toISOString(), slides: [] };
  return JSON.parse(readFileSync(path, 'utf8')) as AggregateFile;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00').getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status }: { status: SlideSummary['status'] }) {
  const styles: Record<string, string> = {
    draft: 'bg-muted/20 text-muted',
    'in-review': 'bg-accent/20 text-primary',
    delivered: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-500',
  };
  return <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${styles[status] ?? styles.draft}`}>{status}</span>;
}

export default function Dashboard() {
  const { slides, generated_at } = loadAggregate();

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <header className="flex items-baseline justify-between mb-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">DXCare Slides</h1>
          <p className="text-sm text-muted mt-1">{slides.length}개 프로젝트</p>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="text-sm text-muted hover:text-ink">로그아웃</button>
        </form>
      </header>

      <div className="grid gap-3">
        {slides.map((s) => {
          const d = daysUntil(s.meeting_date);
          const dLabel = d === null ? '' : d > 0 ? `D-${d}` : d === 0 ? 'D-Day' : `D+${-d}`;
          return (
            <article key={s.slug} className="bg-white rounded-xl border border-muted/30 p-5 hover:border-accent transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold truncate">{s.title}</h2>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-sm text-muted truncate">
                    {s.audience || '—'}
                    {s.audience_org && ` · ${s.audience_org}`}
                  </p>
                  <p className="text-xs text-muted mt-2">
                    {s.meeting_date ? `${s.meeting_date} ${dLabel}` : '미팅일 미정'}
                    {' · '}
                    {s.milestone_count > 0 ? `${s.milestone_count} 마일스톤` : '마일스톤 없음'}
                    {!s.has_index && ' · ⚠ index 없음'}
                    {!s.has_skeleton && ' · ⚠ 뼈대 없음'}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {s.has_index && (
                    <a href={`/slides/${s.slug}/`} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-sm bg-primary text-white rounded-lg hover:bg-primary/90">열기</a>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <footer className="mt-10 text-xs text-muted">
        generated: {generated_at}
      </footer>
    </main>
  );
}
