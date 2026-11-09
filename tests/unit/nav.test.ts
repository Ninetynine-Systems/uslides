import { describe, expect, it } from 'vitest';
import { classifyTouch, tapTarget, swipeTarget } from '../../src/render/nav';

describe('tapTarget', () => {
  it('goes back on the left third and forward everywhere else', () => {
    expect(tapTarget(10, 900, 3, 5)).toBe(2);
    expect(tapTarget(299, 900, 3, 5)).toBe(2);
    expect(tapTarget(300, 900, 3, 5)).toBe(4);
    expect(tapTarget(450, 900, 3, 5)).toBe(4);
    expect(tapTarget(899, 900, 3, 5)).toBe(4);
  });
  it('stays at the ends', () => {
    expect(tapTarget(10, 900, 1, 5)).toBe(1);
    expect(tapTarget(800, 900, 5, 5)).toBe(5);
  });
});

describe('swipeTarget', () => {
  it('a swipe to the left goes forward and a swipe to the right goes back', () => {
    expect(swipeTarget(-80, 5, 2, 5)).toBe(3);
    expect(swipeTarget(80, -5, 2, 5)).toBe(1);
  });
  it('stays at the ends', () => {
    expect(swipeTarget(80, 0, 1, 5)).toBe(1);
    expect(swipeTarget(-80, 0, 5, 5)).toBe(5);
  });
  it('ignores short, vertical and diagonal movements', () => {
    expect(swipeTarget(-20, 0, 2, 5)).toBeUndefined();
    expect(swipeTarget(-5, 120, 2, 5)).toBeUndefined();
    expect(swipeTarget(-80, 70, 2, 5)).toBeUndefined();
  });
});

describe('classifyTouch', () => {
  it('tells a tap from a swipe from nothing', () => {
    expect(classifyTouch(2, 3)).toBe('tap');
    expect(classifyTouch(-80, 4)).toBe('swipe');
    expect(classifyTouch(0, 90)).toBe('none');
    expect(classifyTouch(25, 0)).toBe('none'); // too far for a tap, too short for a swipe
  });
});
