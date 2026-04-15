/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadProgressStoreScript() {
  const code = readFileSync(join(__dirname, '../js/progressStore.js'), 'utf8');
  const w = typeof window !== 'undefined' ? window : globalThis;
  w.eval(code);
}

describe('ProgressStore streak helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    loadProgressStoreScript();
  });

  afterEach(() => {
    localStorage.clear();
    const w = typeof window !== 'undefined' ? window : globalThis;
    delete w.ProgressStore;
  });

  it('same calendar day does not change streak', () => {
    const w = typeof window !== 'undefined' ? window : globalThis;
    const h = w.ProgressStore.__testHelpers;
    const today = h.todayYMD();
    const r = h.applyActivityForStreak({
      streak: 3,
      lastActiveDate: today,
    });
    expect(r.streak).toBe(3);
    expect(r.lastActiveDate).toBe(today);
  });

  it('yesterday increments streak', () => {
    const w = typeof window !== 'undefined' ? window : globalThis;
    const h = w.ProgressStore.__testHelpers;
    const t = h.todayYMD();
    const parts = t.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() - 1);
    const y =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    const r = h.applyActivityForStreak({ streak: 4, lastActiveDate: y });
    expect(r.streak).toBe(5);
    expect(r.lastActiveDate).toBe(t);
  });

  it('gap resets streak to 1', () => {
    const w = typeof window !== 'undefined' ? window : globalThis;
    const h = w.ProgressStore.__testHelpers;
    const t = h.todayYMD();
    const r = h.applyActivityForStreak({ streak: 10, lastActiveDate: '2000-01-01' });
    expect(r.streak).toBe(1);
    expect(r.lastActiveDate).toBe(t);
  });

  it('first activity sets streak 1', () => {
    const w = typeof window !== 'undefined' ? window : globalThis;
    const h = w.ProgressStore.__testHelpers;
    const t = h.todayYMD();
    const r = h.applyActivityForStreak({ streak: 99, lastActiveDate: '' });
    expect(r.streak).toBe(1);
    expect(r.lastActiveDate).toBe(t);
  });
});
