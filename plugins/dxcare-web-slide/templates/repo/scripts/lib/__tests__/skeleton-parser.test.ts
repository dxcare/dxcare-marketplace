import { describe, it, expect } from 'vitest';
import { parseSkeleton } from '../skeleton-parser.js';

const sample = `---
title: "Test Deck"
slug: test
audience: "Test Audience"
meeting_date: 2026-05-01
theme: corporate
status: draft
---

# Slide 1: Title
**Core Message:** Hello world.
**Notes:** opener

---

# Slide 2: Problem
**Core Message:** It is hard.
**Body Points:**
- A
- B
`;

describe('parseSkeleton', () => {
  it('extracts frontmatter fields', () => {
    const s = parseSkeleton(sample);
    expect(s.frontmatter.title).toBe('Test Deck');
    expect(s.frontmatter.slug).toBe('test');
    expect(s.frontmatter.audience).toBe('Test Audience');
  });

  it('splits slides by # Slide N heading', () => {
    const s = parseSkeleton(sample);
    expect(s.slides).toHaveLength(2);
    expect(s.slides[0].heading).toBe('Slide 1: Title');
    expect(s.slides[0].coreMessage).toBe('Hello world.');
    expect(s.slides[1].heading).toBe('Slide 2: Problem');
  });

  it('leaves coreMessage null when line absent', () => {
    const s = parseSkeleton(`---\ntitle: X\n---\n\n# Slide 1: Only heading\nSome body.\n`);
    expect(s.slides[0].coreMessage).toBeNull();
  });

  it('throws on missing frontmatter', () => {
    expect(() => parseSkeleton('# Slide 1: x\n')).toThrow(/frontmatter/i);
  });
});
