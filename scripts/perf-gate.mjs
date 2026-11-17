// The Performance gate (docs/api.md §9.2): checks packages/react-xlsx-viewer/perf-results.json
// (`npm run perf`) and bundle-size.json (`node scripts/bundle-size.mjs --json`) against perf-budget.json.
// Prints a pass / warn / fail table (also to the job summary) and exits 1 on any fail.
//
//   node scripts/perf-gate.mjs [--results perf-results.json] [--bundle bundle-size.json] [--budget perf-budget.json]
//
// Node built-ins only. Paths in the budget are dotted (`keyboard.arrow.p95`); `list[key=value].field`
// picks a list entry by a field, as in `copy[cells=50000].ms`.
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Reads a dotted path; `name[key=value]` selects the list entry whose `key` equals `value`. */
export function pick(obj, path) {
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    const m = /^([^[]+)\[([^=\]]+)=([^\]]+)\]$/.exec(part);
    if (m) {
      const list = cur[m[1]];
      cur = Array.isArray(list) ? list.find((e) => String(e?.[m[2]]) === m[3]) : undefined;
    } else cur = cur[part];
  }
  return cur;
}

const UNITS = { KiB: 1024 };

/**
 * Evaluates every check. Returns rows { group, label, value, max, warn, unit, status, note } where status is
 * 'pass' | 'warn' | 'fail'. A missing value fails: the harness changed, so the budget must too.
 */
export function evaluate(budget, results, bundle) {
  return budget.checks.map((c) => {
    const raw = pick(c.source === 'bundle' ? bundle : results, c.path);
    const scale = UNITS[c.unit] ?? 1;
    const base = { group: c.group, label: c.label, max: c.max, warn: c.warn, unit: c.unit ?? (c.kind === 'none' ? '' : 'ms'), observed: c.observed };
    if (c.kind === 'none') {
      if (raw === undefined) return { ...base, value: 'missing', status: 'fail', note: `no ${c.path} in the results` };
      const none = raw === null || raw === 0 || (Array.isArray(raw) && raw.length === 0);
      return { ...base, value: none ? 'none' : raw, status: none ? 'pass' : 'fail' };
    }
    if (typeof raw !== 'number' || Number.isNaN(raw)) return { ...base, value: 'missing', status: 'fail', note: `no number at ${c.path}` };
    const value = Math.round((raw / scale) * 10) / 10;
    const status = value > c.max ? 'fail' : c.warn !== undefined && value > c.warn ? 'warn' : 'pass';
    return { ...base, value, status };
  });
}

const fmt = (v, unit) => (typeof v === 'number' ? `${v.toLocaleString('en-US')}${unit && unit !== 'ms' ? ` ${unit}` : unit === 'ms' ? ' ms' : ''}` : String(v));
const ICON = { pass: 'pass', warn: '**warn**', fail: '**FAIL**' };

export function table(rows, report, results) {
  const lines = [
    '### Performance gate (perf-budget.json)',
    '',
    '| | check | value | budget | observed when set |',
    '|---|---|---:|---:|---|',
    ...rows.map((r) => `| ${ICON[r.status]} | ${r.group}. ${r.label} | ${fmt(r.value, r.unit)} | ${r.max === undefined ? 'none' : `≤ ${fmt(r.max, r.unit)}`}${r.warn === undefined ? '' : ` (warn > ${fmt(r.warn, r.unit)})`} | ${r.observed ?? ''}${r.note ? `; ${r.note}` : ''} |`),
  ];
  if (report?.length) {
    lines.push('', 'Reported, not gated (they depend on the runner):', '', '| measure | value |', '|---|---:|');
    for (const r of report) lines.push(`| ${r.label} | ${pick(results, r.path) ?? 'n/a'} |`);
  }
  const failed = rows.filter((r) => r.status === 'fail').length;
  const warned = rows.filter((r) => r.status === 'warn').length;
  lines.push('', failed ? `**${failed} of ${rows.length} checks failed.**` : `All ${rows.length} checks passed${warned ? ` (${warned} warning${warned > 1 ? 's' : ''})` : ''}.`);
  return lines.join('\n');
}

function main(argv) {
  const arg = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const budget = JSON.parse(readFileSync(resolve(arg('--budget', `${root}/perf-budget.json`)), 'utf8'));
  const results = JSON.parse(readFileSync(resolve(arg('--results', `${root}/packages/react-xlsx-viewer/perf-results.json`)), 'utf8'));
  const bundlePath = arg('--bundle', `${root}/bundle-size.json`);
  let bundle = {};
  try {
    bundle = JSON.parse(readFileSync(resolve(bundlePath), 'utf8'));
  } catch {
    // Missing bundle sizes make the bundle checks fail with "missing", which says what to run.
  }
  const rows = evaluate(budget, results, bundle);
  const out = table(rows, budget.report, results);
  console.log(out);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n`);
  return rows.some((r) => r.status === 'fail') ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
