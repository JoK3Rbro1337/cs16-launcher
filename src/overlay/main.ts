import { drawCrosshair, type CrosshairDrawSettings } from '../lib/crosshair'
import type { CrosshairSettings } from '../../electron/modules/crosshair-settings'

/**
 * M15 overlay renderer — deliberately vanilla (no React, no app CSS/fonts):
 * this window is just a canvas that redraws whenever crosshair-overlay.ts
 * pushes new settings, or the window resizes (a display change while
 * visible). Kept as its own Vite entry (overlay.html) so it never pulls in
 * the main app's bundle weight for something this small.
 */

const canvas = document.getElementById('crosshair-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

let current: CrosshairSettings | null = null

function toDrawSettings(s: CrosshairSettings): CrosshairDrawSettings {
  const { shape, size, thickness, gap, color, outline, opacity, offsetX, offsetY } = s
  return { shape, size, thickness, gap, color, outline, opacity, offsetX, offsetY }
}

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  render()
}

function render(): void {
  if (!current) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    return
  }
  drawCrosshair(ctx, window.innerWidth, window.innerHeight, toDrawSettings(current))
}

window.addEventListener('resize', resizeCanvas)
resizeCanvas()

window.launcher
  .getCrosshairSettings()
  .then((s) => {
    current = s
    render()
  })
  .catch(() => {})

window.launcher.onCrosshairSettingsChanged((s) => {
  current = s
  render()
})
