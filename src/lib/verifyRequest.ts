// Lets the command palette's "Verify files" action open Settings' confirm
// modal even when Settings isn't mounted yet — it just navigated there.
// If Settings is already mounted, the request fires immediately; otherwise
// it's held as `pending` until Settings' mount effect registers a handler.

let pending = false
let liveHandler: (() => void) | null = null

export function requestVerify(): void {
  if (liveHandler) liveHandler()
  else pending = true
}

export function registerVerifyHandler(fn: () => void): () => void {
  liveHandler = fn
  if (pending) {
    pending = false
    fn()
  }
  return () => {
    if (liveHandler === fn) liveHandler = null
  }
}
