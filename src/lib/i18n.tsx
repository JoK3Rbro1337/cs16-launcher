import { createContext, useContext, useEffect, useState } from 'react'
import { CATALOGS, DEFAULT_LOCALE, LOCALE_NAMES, LOCALES, type Locale, type Messages } from '../../locales'

interface I18nContextValue {
  locale: Locale
  t: Messages
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

/**
 * Blocks first paint on one IPC round-trip (main process resolves the persisted-or-detected
 * locale — see locale-store.ts) rather than flashing English before switching. That round-trip
 * is local and typically sub-millisecond; every other "loading" gate in this app (Sidebar's
 * Steam detection, Servers' first fetch) already accepts a brief blank/skeleton state the same way.
 */
export function I18nProvider({ children }: { children: React.ReactNode }): React.JSX.Element | null {
  const [locale, setLocaleState] = useState<Locale | null>(null)

  useEffect(() => {
    window.launcher
      .getLocale()
      .then(setLocaleState)
      .catch(() => setLocaleState(DEFAULT_LOCALE))
  }, [])

  if (locale === null) return null

  function setLocale(next: Locale): void {
    setLocaleState(next)
    window.launcher.setLocale(next).catch(() => {})
  }

  return <I18nContext.Provider value={{ locale, t: CATALOGS[locale], setLocale }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}

/** Shorthand for the common case of only needing the message tree, not the locale/setter. */
export function useT(): Messages {
  return useI18n().t
}

export { LOCALES, LOCALE_NAMES }
export type { Locale, Messages }
