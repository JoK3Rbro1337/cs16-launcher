import { en, type Messages } from './en.ts'
import { uk } from './uk.ts'
import { ru } from './ru.ts'
import type { Locale } from './types.ts'

export * from './types.ts'
export type { Messages } from './en.ts'

// uk.ts/ru.ts declare `const uk: Messages = {...}` / `const ru: Messages = {...}` —
// TypeScript's excess-property + missing-property checks on that assignment are
// what enforce key parity at compile time. scripts/verify-i18n-keys.mts does the
// same check at runtime (also catches a locale file that types-checks but was
// never wired in here, or drifts after a non-typechecked edit).
export const CATALOGS: Record<Locale, Messages> = { en, uk, ru }

/** Each language's own name for itself — never translated (autonym), same convention as config-variant names. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  uk: 'Українська',
  ru: 'Русский'
}
