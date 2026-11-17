// Unit tests for scripts/perf-gate.mjs, and the budget against the recorded CI runs in scripts/fixtures/perf.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { evaluate, pick, table } from './perf-gate.mjs';

const root = join(import.meta.dirname, '..');
const budget = JSON.parse(readFileSync(join(root, 'perf-budget.json'), 'utf8'));
const fixtures = join(import.meta.dirname, 'fixtures/perf');

test('pick reads dotted paths and selects list entries by a field', () => {
  const o = { a: { b: 2 }, copy: [{ cells: 10, ms: 1 }, { cells: 50000, ms: 99 }] };
  assert.equal(pick(o, 'a.b'), 2);
  assert.equal(pick(o, 'copy[cells=50000].ms'), 99);
  assert.equal(pick(o, 'copy[cells=7].ms'), undefined);
  assert.equal(pick(o, 'x.y.z'), undefined);
});

test('pass, warn and fail; units; a missing value fails', () => {
  const b = {
    checks: [
      { group: 'A', label: 'cells', path: 'n', max: 10 },
      { group: 'C', label: 'copy', path: 'c', max: 250, warn: 200 },
      { group: 'C', label: 'copy slow', path: 'd', max: 250, warn: 200 },
      { group: 'A', label: 'size', source: 'bundle', path: 'gz', max: 36, unit: 'KiB' },
      { group: 'A', label: 'long frame', path: 'lf', kind: 'none' },
      { group: 'A', label: 'long frame 2', path: 'lf2', kind: 'none' },
      { group: 'B', label: 'gone', path: 'gone.p95', max: 1 },
    ],
  };
  const rows = evaluate(b, { n: 11, c: 210, d: 260, lf: null, lf2: 73 }, { gz: 36 * 1024 });
  assert.deepEqual(rows.map((r) => r.status), ['fail', 'warn', 'fail', 'pass', 'pass', 'fail', 'fail']);
  assert.equal(rows[3].value, 36);
  assert.equal(rows[6].value, 'missing');
  const out = table(rows, [], {});
  assert.match(out, /\*\*4 of 7 checks failed\.\*\*/);
});

test('the budget has groups A, B and C, and every gated path exists in a real result', () => {
  assert.deepEqual([...new Set(budget.checks.map((c) => c.group))].sort(), ['A', 'B', 'C']);
  const files = readdirSync(fixtures).filter((f) => f.endsWith('.json') && !f.startsWith('bundle'));
  const results = JSON.parse(readFileSync(join(fixtures, files.at(-1)), 'utf8'));
  for (const c of budget.checks.filter((c) => c.source !== 'bundle')) assert.notEqual(pick(results, c.path), undefined, c.path);
});

test('every recorded CI run passes the budget', () => {
  const bundle = JSON.parse(readFileSync(join(fixtures, 'bundle-size.json'), 'utf8'));
  const files = readdirSync(fixtures).filter((f) => /^run-\d+\.json$/.test(f));
  assert.ok(files.length >= 10, `${files.length} recorded runs`);
  for (const f of files) {
    const rows = evaluate(budget, JSON.parse(readFileSync(join(fixtures, f), 'utf8')), bundle);
    const failed = rows.filter((r) => r.status === 'fail').map((r) => `${r.label}: ${r.value}`);
    assert.deepEqual(failed, [], f);
  }
});
