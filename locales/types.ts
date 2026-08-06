// M16 — shared locale plumbing. Deliberately zero Electron/Node/React
// dependency so this whole directory is importable from three different
// runtimes unmodified: the renderer bundle (Vite), the main-process bundle
// (electron-vite/esbuild), and plain `node` for verify scripts and the
// main-process modules that need locale-aware strings without pulling in
// Electron (see notification-rules.ts, which is deliberately Electron-free
// for its own standalone verify script).
//
// Every relative import inside locales/ uses an explicit `.ts` extension —
// unlike the rest of this codebase (which relies on bundler moduleResolution
// and omits extensions) — specifically so this directory stays loadable by
// Node's native ESM/TS loader, which requires explicit extensions. Bundlers
// (Vite, esbuild) resolve explicit extensions fine either way, so this
// costs nothing there.

export type Locale = 'en' | 'uk' | 'ru'

export const LOCALES: Locale[] = ['en', 'uk', 'ru']
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value)
}
