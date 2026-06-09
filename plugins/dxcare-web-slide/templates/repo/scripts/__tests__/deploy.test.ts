import { describe, it, expect } from 'vitest';
import { parseArgs, chooseMode } from '../deploy.js';

describe('parseArgs', () => {
  it('defaults to preview mode', () => {
    expect(parseArgs([])).toEqual({ prod: false });
  });
  it('detects --prod', () => {
    expect(parseArgs(['--prod'])).toEqual({ prod: true });
  });
  it('detects --production', () => {
    expect(parseArgs(['--production'])).toEqual({ prod: true });
  });
});

describe('chooseMode', () => {
  it('returns empty arg list for preview', () => {
    expect(chooseMode({ prod: false })).toEqual([]);
  });
  it('returns --prod for production', () => {
    expect(chooseMode({ prod: true })).toEqual(['--prod']);
  });
});
