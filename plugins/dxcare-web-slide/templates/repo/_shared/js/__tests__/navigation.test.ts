import { describe, it, expect } from 'vitest';
import {
  clampIndex,
  resolveSwipe,
  WHEEL_RESET_MS,
  WHEEL_THRESHOLD,
  SWIPE_THRESHOLD,
} from '../navigation.js';

// These tests cover the DOM-free navigation logic extracted from
// initNavigation (B-008 #4). The listener wiring (keydown/wheel/click/touch →
// document/window/deck) stays DOM-bound and is verified in the browser, since
// the consumer toolchain ships vitest without jsdom/happy-dom.

describe('clampIndex — goTo / go index math (AC-1.1, AC-1.3)', () => {
  const LEN = 5; // a 5-slide deck → valid indices 0..4

  it('passes through an in-range index unchanged', () => {
    expect(clampIndex(0, LEN)).toBe(0);
    expect(clampIndex(2, LEN)).toBe(2);
    expect(clampIndex(LEN - 1, LEN)).toBe(LEN - 1);
  });

  it('clamps below 0 to 0 (go(-1) at the first slide is a no-op floor)', () => {
    expect(clampIndex(-1, LEN)).toBe(0);
    expect(clampIndex(-99, LEN)).toBe(0);
  });

  it('clamps above len-1 to len-1 (go(+1) at the last slide is a no-op ceiling)', () => {
    expect(clampIndex(LEN, LEN)).toBe(LEN - 1);
    expect(clampIndex(99, LEN)).toBe(LEN - 1);
  });

  it('handles a single-slide deck: every target collapses to 0', () => {
    expect(clampIndex(0, 1)).toBe(0);
    expect(clampIndex(1, 1)).toBe(0);
    expect(clampIndex(-1, 1)).toBe(0);
  });

  it('never produces a negative index for an empty deck (len <= 0 → 0)', () => {
    expect(clampIndex(0, 0)).toBe(0);
    expect(clampIndex(3, 0)).toBe(0);
    expect(clampIndex(-3, 0)).toBe(0);
  });

  it('relative go() composes through clamp at both ends', () => {
    // go(delta) === clampIndex(current + delta, len)
    expect(clampIndex(0 + -1, LEN)).toBe(0); // go(-1) at slide 0
    expect(clampIndex(0 + 1, LEN)).toBe(1); // go(+1) at slide 0
    expect(clampIndex(LEN - 1 + 1, LEN)).toBe(LEN - 1); // go(+1) at last slide
  });
});

describe('resolveSwipe — dominant-axis touch resolution (AC-1.2)', () => {
  it('horizontal swipe past threshold: left → advance(+1), right → retreat(-1)', () => {
    expect(resolveSwipe(-100, 0)).toBe(1);
    expect(resolveSwipe(100, 0)).toBe(-1);
  });

  it('vertical swipe past threshold: up → advance(+1), down → retreat(-1)', () => {
    expect(resolveSwipe(0, -100)).toBe(1);
    expect(resolveSwipe(0, 100)).toBe(-1);
  });

  it('ignores travel at or below the threshold on either axis (no-op)', () => {
    expect(resolveSwipe(SWIPE_THRESHOLD, 0)).toBe(0); // exactly at threshold → no-op (> not >=)
    expect(resolveSwipe(0, SWIPE_THRESHOLD)).toBe(0);
    expect(resolveSwipe(SWIPE_THRESHOLD - 1, 0)).toBe(0);
    expect(resolveSwipe(0, 0)).toBe(0);
  });

  it('a diagonal swipe fires at most once, on the dominant axis', () => {
    // dx dominates → resolved as a horizontal swipe, vertical component ignored
    expect(resolveSwipe(-100, 30)).toBe(1);
    // dy dominates → resolved as a vertical swipe, horizontal component ignored
    expect(resolveSwipe(30, -100)).toBe(1);
  });

  it('ties (|dx| === |dy|) resolve on the horizontal axis', () => {
    // |dx| >= |dy| branch wins the tie
    expect(resolveSwipe(-80, 80)).toBe(1); // left-down diagonal → treated as left swipe
    expect(resolveSwipe(80, -80)).toBe(-1); // right-up diagonal → treated as right swipe
  });

  it('respects a custom threshold argument', () => {
    expect(resolveSwipe(50, 0, 100)).toBe(0); // below custom threshold
    expect(resolveSwipe(150, 0, 100)).toBe(-1); // above custom threshold
  });
});

describe('tunable constants', () => {
  it('exposes the wheel and swipe tunables as named exports', () => {
    expect(WHEEL_RESET_MS).toBe(200);
    expect(WHEEL_THRESHOLD).toBe(60);
    expect(SWIPE_THRESHOLD).toBe(40);
  });
});
