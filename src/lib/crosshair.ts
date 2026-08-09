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

/**
 * Temporary alignment aid (M15 follow-up, 2026-08) — draws thin, full-length
 * lines spanning the entire overlay window plus a small center dot, instead
 * of the configured crosshair shape, so a player can visually confirm the
 * overlay window's own center against the game's centered elements (crosshair,
 * HUD, menu) with a target-drawing precise enough that a few pixels of true
 * misalignment (e.g. the workArea-vs-bounds panel-offset bug this shipped
 * alongside) is unambiguous rather than lost in a small crosshair's own
 * visual noise. Deliberately a separate function from drawCrosshair rather
 * than a shape variant on it — keeps this easy to strip out later, and never
 * risks the "Settings preview matches the real overlay" guarantee the real
 * shapes depend on. Bright magenta specifically so it reads as "this is a
 * debug overlay", never mistakable for a real configured crosshair color.
 */
const ALIGNMENT_GUIDE_COLOR = '#ff2fd6'

export function drawAlignmentGuide(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height)
  const cx = width / 2
  const cy = height / 2

  ctx.save()
  ctx.strokeStyle = ALIGNMENT_GUIDE_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, cy + 0.5)
  ctx.lineTo(width, cy + 0.5)
  ctx.moveTo(cx + 0.5, 0)
  ctx.lineTo(cx + 0.5, height)
  ctx.stroke()

  ctx.fillStyle = ALIGNMENT_GUIDE_COLOR
  ctx.beginPath()
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
