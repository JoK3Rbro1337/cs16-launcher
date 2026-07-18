import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export type ToastKind = 'error' | 'warn' | 'info' | 'ok'

interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastContextValue {
  pushToast: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DISMISS_MS = 4000
const MAX_TOASTS = 3

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number): void => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (message: string, kind: ToastKind = 'error'): void => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, kind }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_MS)
      )
    },
    [dismiss]
  )

  function pin(id: number): void {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
  }

  function unpin(id: number): void {
    timers.current.set(
      id,
      setTimeout(() => dismiss(id), DISMISS_MS)
    )
  }

  const value = useMemo(() => ({ pushToast }), [pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            onMouseEnter={() => pin(t.id)}
            onMouseLeave={() => unpin(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
