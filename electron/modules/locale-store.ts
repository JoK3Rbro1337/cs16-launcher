/**
 * locale-store — M16: persisted UI language, shared between the renderer
 * and main process. The renderer owns the actual switcher (Settings) and
 * calls setLocale() on change; main-process code that needs locale-aware
 * strings without a live renderer round-trip (the notification poller's
 * background ticks, which can fire with no window focused) reads the
 * in-memory cache via getLocaleSync() instead of re-reading disk each time.
 *
 * First run: no persisted file yet, so the locale is detected from
 * Electron's app.getLocale() (the OS UI language), falling back to 'en' if
 * it's not one of the three we ship. Same read-modify-write-via-tmp-file
 * persistence pattern as known-servers.ts.
 *
 * Every relative import here uses an explicit extension (see
 * locales/types.ts's doc comment) so this module — unlike most of
 * electron/modules/*.ts — stays loadable by Node's native TS/ESM loader
 * without a bundler, the same backend-verification harness recipe used for
 * known-servers.ts/player-tracking.ts.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../locales/types.ts'

const FILENAME = 'locale.json'

let current: Locale | null = null
let writeQueue: Promise<void> = Promise.resolve()

function userDataDir(): string {
  return app.getPath('userData')
}

function detectSystemLocale(): Locale {
  const primary = app.getLocale().toLowerCase().split('-')[0]
  return isLocale(primary) ? primary : DEFAULT_LOCALE
}

async function load(): Promise<Locale> {
  try {
    const text = await readFile(join(userDataDir(), FILENAME), 'utf-8')
    const parsed = JSON.parse(text) as { locale?: string }
    if (parsed.locale && isLocale(parsed.locale)) return parsed.locale
  } catch {
    // No persisted file yet (first run) or it's unreadable — fall through to system detection.
  }
  return detectSystemLocale()
}

async function persist(locale: Locale): Promise<void> {
  const dest = join(userDataDir(), FILENAME)
  const next = writeQueue.then(async () => {
    await mkdir(userDataDir(), { recursive: true })
    const tmp = `${dest}.part`
    await writeFile(tmp, JSON.stringify({ locale }, null, 2))
    await rename(tmp, dest)
  })
  writeQueue = next.catch(() => {})
  return next
}

/** Call once at startup (app.whenReady, before registering IPC) so getLocaleSync() is safe everywhere after. */
export async function initLocale(): Promise<Locale> {
  current = await load()
  return current
}

/** Safe any time after initLocale() has resolved — used by code with no renderer round-trip (notification-poller). */
export function getLocaleSync(): Locale {
  return current ?? DEFAULT_LOCALE
}

export async function getLocale(): Promise<Locale> {
  if (current === null) current = await load()
  return current
}

export async function setLocale(locale: Locale): Promise<void> {
  current = locale
  await persist(locale)
}
