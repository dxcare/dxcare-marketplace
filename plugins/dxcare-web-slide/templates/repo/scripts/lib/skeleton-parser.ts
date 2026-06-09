import yaml from 'js-yaml';

export interface Slide {
  heading: string;
  coreMessage: string | null;
  body: string;
}

export interface Skeleton {
  frontmatter: Record<string, unknown>;
  slides: Slide[];
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;
const SLIDE_RE = /^#\s+(Slide\s+\d+:[^\n]*)$/gm;
const CORE_MSG_RE = /^\*\*Core Message:\*\*\s*(.+?)\s*$/m;

export function parseSkeleton(input: string): Skeleton {
  const fm = FRONTMATTER_RE.exec(input);
  if (!fm) throw new Error('skeleton.md missing YAML frontmatter');
  const frontmatter = yaml.load(fm[1]) as Record<string, unknown>;
  const body = input.slice(fm[0].length);

  const slides: Slide[] = [];
  const matches = [...body.matchAll(SLIDE_RE)];
  for (let i = 0; i < matches.length; i++) {
    const heading = matches[i][1];
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : body.length;
    const section = body.slice(start, end).trim();
    const cm = CORE_MSG_RE.exec(section);
    slides.push({
      heading,
      coreMessage: cm ? cm[1] : null,
      body: section,
    });
  }
  return { frontmatter, slides };
}
