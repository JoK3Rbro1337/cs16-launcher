#!/usr/bin/env node
/**
 * M16 — heuristic grep-based check that no translatable UI copy was left as
 * a raw string literal in the renderer (src/pages, src/components). Looks
 * for two shapes:
 *
 *   1. JSX text nodes: `>literal text<` with no `{`/`}` in between (a real
 *      expression like `{t.foo.bar}` never matches this pattern).
 *   2. Common translatable JSX attributes (title/placeholder/aria-label/alt)
 *      given as a double-quoted literal (`title="Foo"`) rather than an
 *      expression (`title={t.foo.bar}`).
 *
 * Deliberately out of scope (won't be flagged, and shouldn't be "fixed" by
 * adding a locale key): the product name ("1.6X", "1.6X Launcher" — a brand,
 * never translated, see ALLOWLIST), single glyphs/units/punctuation that
 * aren't language-specific (★ ☆ × ▲ ▼ · — ms), and config-variant/manifest
 * names, which are data supplied at runtime, not JSX text literals, so they
 * were never going to match this pattern in the first place.
 *
 * Only checks src/ (the renderer) — main-process strings that reach the
 * user (system notifications, dialog titles) are reviewed by hand in
 * notification-rules.ts/notification-poller.ts/profile.ts, and can't be
 * grepped this way since they're plain template-literal returns, not JSX.
 *
 * Run with `node scripts/verify-no-hardcoded-strings.mjs`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOTS = ['src/pages', 'src/components']

// Exact literal text nodes that are legitimately not translated.
const ALLOWLIST = new Set(['1.6X', '1.6X Launcher', 'CS 1.6', 'My Config', '—', '·', '★', '☆', '×', '▲', '▼', '…'])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) out.push(...walk(path))
    else if (extname(path) === '.tsx') out.push(path)
  }
  return out
}

// This is a line-based text scan, not a real JSX parser, so `>...<` also matches
// TypeScript generics/comparisons that happen to sit next to each other on one line
// (e.g. `useState<Foo | null>(() => loadJSON<Bar>(...))`). Real JSX text nodes in this
// codebase's style never contain code-punctuation like these, so treating any match
// with them as "not prose" filters that noise out without an allowlist per false positive.
const CODE_PUNCTUATION = /[(){}/<>=;:|]/

function isFlaggable(text) {
  const trimmed = text.trim()
  if (trimmed.length === 0) return false
  if (ALLOWLIST.has(trimmed)) return false
  if (CODE_PUNCTUATION.test(trimmed)) return false
  // Needs at least one run of 2+ letters to count as prose (filters out bare
  // punctuation/numbers/units like "ms", counters, single symbols).
  if (!/[A-Za-z]{2,}/.test(trimmed)) return false
  // A single whitespace-free token with an internal lower->upper transition
  // (loadJSON, useState) is a code identifier, not UI prose — this shape
  // shows up when a line mixes an arrow function's `=>` with a generic
  // (`useState<Foo>(() => loadJSON<Bar>(...))`), whose `>`/`<` chars this
  // line-based scan can't distinguish from real JSX tag boundaries.
  if (!trimmed.includes(' ') && /[a-z][A-Z]/.test(trimmed)) return false
  return true
}

let issues = 0
const files = ROOTS.flatMap((r) => walk(r))

for (const file of files) {
  const lines = readFileSync(file, 'utf-8').split('\n')
  lines.forEach((line, i) => {
    const lineNum = i + 1

    // JSX text node: `>...<` with no braces (an expression) inside.
    for (const m of line.matchAll(/>([^<>{}\n]+)</g)) {
      if (isFlaggable(m[1])) {
        console.log(`  FAIL ${file}:${lineNum}  JSX text: ${JSON.stringify(m[1].trim())}`)
        issues++
      }
    }

    // title/placeholder/aria-label/alt given as a literal string, not {expr}.
    for (const m of line.matchAll(/\b(title|placeholder|aria-label|alt)="([^"]+)"/g)) {
      if (isFlaggable(m[2])) {
        console.log(`  FAIL ${file}:${lineNum}  ${m[1]}="${m[2]}"`)
        issues++
      }
    }
  })
}

console.log(`\nScanned ${files.length} files under ${ROOTS.join(', ')}.`)
console.log(issues === 0 ? 'ALL CHECKS PASSED (no hardcoded UI strings found)' : `${issues} POSSIBLE HARDCODED STRING(S) FOUND`)
process.exit(issues === 0 ? 0 : 1)
