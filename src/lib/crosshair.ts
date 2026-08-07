import type { CrosshairShape } from '../../electron/modules/crosshair-settings'

/**
 * Shared, pure canvas-drawing logic for M15's crosshair — used identically
 * by the overlay page (src/overlay/main.ts) and Settings' live preview, so
 * "what you see in Settings" is guaranteed to be exactly what renders over
 * the game, not a lookalike re-implementation that could drift.
 */
export interface CrosshairDrawSettings {
  shape: CrosshairShape
  size: number
  thickness: number
  gap: number
  color: string
  outline: boolean
  opacity: number
  offsetX: number
  offsetY: number
}

const OUTLINE_COLOR = 'rgba(0, 0, 0, 0.85)'
const OUTLINE_STROKE_PAD = 2
const OUTLINE_FILL_PAD = 1.5

function drawCrossLines(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  gap: number,
  lineWidth: number,
  color: string
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(cx, cy - gap - size)
  ctx.lineTo(cx, cy - gap)
  ctx.moveTo(cx, cy + gap)
  ctx.lineTo(cx, cy + gap + size)
  ctx.moveTo(cx - gap - size, cy)
  ctx.lineTo(cx - gap, cy)
  ctx.moveTo(cx + gap, cy)
  ctx.lineTo(cx + gap + size, cy)
  ctx.stroke()
}

function drawDot(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, color: string): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
}

function drawCircleStroke(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  lineWidth: number,
  color: string
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
}

/** Clears the canvas and draws the crosshair centered at (width/2 + offsetX, height/2 + offsetY). */
export function drawCrosshair(ctx: CanvasRenderingContext2D, width: number, height: number, s: CrosshairDrawSettings): void {
  ctx.clearRect(0, 0, width, height)
  const cx = width / 2 + s.offsetX
  const cy = height / 2 + s.offsetY

  ctx.save()
  ctx.globalAlpha = s.opacity
  ctx.lineCap = 'butt'

  switch (s.shape) {
    case 'dot': {
      const r = Math.max(1.5, s.size / 2)
      if (s.outline) drawDot(ctx, cx, cy, r + OUTLINE_FILL_PAD, OUTLINE_COLOR)
      drawDot(ctx, cx, cy, r, s.color)
      break
    }
    case 'cross': {
      if (s.outline) drawCrossLines(ctx, cx, cy, s.size, s.gap, s.thickness + OUTLINE_STROKE_PAD, OUTLINE_COLOR)
      drawCrossLines(ctx, cx, cy, s.size, s.gap, s.thickness, s.color)
      break
    }
    case 'circle': {
      if (s.outline) drawCircleStroke(ctx, cx, cy, s.size, s.thickness + OUTLINE_STROKE_PAD, OUTLINE_COLOR)
      drawCircleStroke(ctx, cx, cy, s.size, s.thickness, s.color)
      break
    }
    case 'cross-dot': {
      const r = Math.max(1.5, s.thickness)
      if (s.outline) {
        drawCrossLines(ctx, cx, cy, s.size, s.gap, s.thickness + OUTLINE_STROKE_PAD, OUTLINE_COLOR)
        drawDot(ctx, cx, cy, r + OUTLINE_FILL_PAD, OUTLINE_COLOR)
      }
      drawCrossLines(ctx, cx, cy, s.size, s.gap, s.thickness, s.color)
      drawDot(ctx, cx, cy, r, s.color)
      break
    }
  }

  ctx.restore()
}
