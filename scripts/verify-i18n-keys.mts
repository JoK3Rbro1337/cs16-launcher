/**
 * M16 — independent runtime check that en/uk/ru locale catalogs have
 * identical key shapes. TypeScript already enforces this at compile time
 * (uk.ts/ru.ts are declared `const x: Messages = {...}`, so a missing or
 * extra key fails `npm run typecheck`), but this script re-verifies it at
 * the object level, with no dependency on tsc having actually been run
 * first — useful as a fast standalone check (e.g. a pre-commit hook) and as
 * a safety net if a locale file is ever edited in a way that types-checks
 * (an `as` cast, a stray `any`) but still drifts in practice.
 *
 * Run with `node scripts/verify-i18n-keys.mts` (Node 22.18+/24+ native TS
 * support, no build step, no Electron needed — locales/ has zero Electron
 * dependency by design, see locales/types.ts's doc comment).
 */

import { en } from '../locales/en.ts'
import { uk } from '../locales/uk.ts'
import { ru } from '../locales/ru.ts'
import { LOCALES } from '../locales/types.ts'

let failures = 0

function check(name: string, condition: boolean): void {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}`)
  }
}

/** Recursively collects dot-paths to every leaf (string or function) in a message tree. */
function collectPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix]
  const paths: string[] = []
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'function' || typeof value !== 'object' || value === null) {
      paths.push(path)
    } else {
      paths.push(...collectPaths(value, path))
    }
  }
  return paths.sort()
}

function diff(a: string[], b: string[]): string[] {
  const bSet = new Set(b)
  return a.filter((p) => !bSet.has(p))
}

console.log(`1. every locale (${LOCALES.join(', ')}) has the exact same key set as en`)

const enPaths = collectPaths(en)
console.log(`  (${enPaths.length} keys in en)`)

for (const [name, catalog] of [
  ['uk', uk],
  ['ru', ru]
] as const) {
  const paths = collectPaths(catalog)
  const missing = diff(enPaths, paths)
  const extra = diff(paths, enPaths)
  check(`${name}: no missing keys`, missing.length === 0)
  if (missing.length > 0) console.log(`    missing: ${missing.join(', ')}`)
  check(`${name}: no extra keys`, extra.length === 0)
  if (extra.length > 0) console.log(`    extra: ${extra.join(', ')}`)
}

console.log('2. leaf types match (string stays string, function stays function) across all three locales')

function leafType(obj: unknown, path: string): string {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const part of parts) cur = (cur as Record<string, unknown>)[part]
  return typeof cur
}

let typeMismatches = 0
for (const path of enPaths) {
  const enType = leafType(en, path)
  const ukType = leafType(uk, path)
  const ruType = leafType(ru, path)
  if (ukType !== enType || ruType !== enType) {
    typeMismatches++
    console.log(`  FAIL type mismatch at ${path}: en=${enType} uk=${ukType} ru=${ruType}`)
  }
}
check('no leaf type mismatches', typeMismatches === 0)
if (typeMismatches > 0) failures += typeMismatches - 1 // avoid double-counting the summary check above

console.log('3. every function leaf in uk/ru is callable with dummy args and returns a string')

let callFailures = 0
function tryCallLeaves(obj: Record<string, unknown>, path = ''): void {
  for (const [key, value] of Object.entries(obj)) {
    const full = path ? `${path}.${key}` : key
    if (typeof value === 'function') {
      try {
        const args = Array.from({ length: value.length }, (_, i) => (i === 0 ? 1 : 'x'))
        const result = (value as (...a: unknown[]) => unknown)(...args)
        if (typeof result !== 'string') throw new Error(`did not return a string (got ${typeof result})`)
      } catch (err) {
        callFailures++
        console.log(`  FAIL ${full} threw/misbehaved: ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (value !== null && typeof value === 'object') {
      tryCallLeaves(value as Record<string, unknown>, full)
    }
  }
}
tryCallLeaves(uk as unknown as Record<string, unknown>)
tryCallLeaves(ru as unknown as Record<string, unknown>)
check('all uk/ru function leaves callable and string-returning', callFailures === 0)

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
