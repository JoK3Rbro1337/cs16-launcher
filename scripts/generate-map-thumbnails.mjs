#!/usr/bin/env node
// Generates original, procedural "tactical schematic" placeholder art for
// the classic CS 1.6 map pool — resources/maps/<mapname>.webp (M11).
//
// Deliberately NOT a trace of any real map layout or Valve radar image:
// each map gets a seeded-random arrangement of abstract blockout shapes
// over a HUD-style grid, so it reads as map art without depicting the
// actual level. Regenerating with the same map name always reproduces the
// same image (seeded PRNG), so this script is safe to re-run.
//
// Pipeline: build an SVG string in-process -> rsvg-convert to PNG (2x, for
// crisp downscaling) -> ImageMagick to webp. Both are required on PATH.

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = fileURLToPath(new URL('../resources/maps', import.meta.url))
const WIDTH = 640
const HEIGHT = 360

const PALETTES = {
  sand: { bgFrom: '#2a2419', bgTo: '#1c1810', accent: '#cfae6b', line: '#45391f' },
  olive: { bgFrom: '#1c2118', bgTo: '#12160e', accent: '#9fae4a', line: '#33401f' },
  slate: { bgFrom: '#1a2024', bgTo: '#10151a', accent: '#6f8fa9', line: '#2a3a44' },
  rust: { bgFrom: '#241a16', bgTo: '#16100d', accent: '#b06a45', line: '#3d2a1f' },
  teal: { bgFrom: '#142320', bgTo: '#0d1614', accent: '#4a9a8a', line: '#1f3d36' }
}

const MAPS = {
  de_dust2: 'sand',
  de_dust: 'sand',
  de_inferno: 'rust',
  de_nuke: 'slate',
  de_train: 'slate',
  de_aztec: 'olive',
  de_cbble: 'slate',
  de_mirage: 'sand',
  cs_assault: 'teal',
  cs_italy: 'rust',
  cs_office: 'slate',
  cs_mansion: 'olive'
}

/** mulberry32 — small, fast, seeded PRNG so output is reproducible per map name. */
function mulberry32(seed) {
  let a = seed
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFromString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (Math.imul(hash, 31) + str.charCodeAt(i)) | 0
  return hash >>> 0
}

function escapeXml(str) {
  return str.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])
}

function buildBlockoutShapes(rng, accent) {
  const shapes = []
  const count = 7 + Math.floor(rng() * 5)
  for (let i = 0; i < count; i++) {
    const kind = rng()
    const x = rng() * WIDTH
    const y = rng() * (HEIGHT * 0.78)
    const opacity = (0.1 + rng() * 0.22).toFixed(2)
    if (kind < 0.55) {
      const w = 40 + rng() * 160
      const h = 30 + rng() * 110
      const rot = Math.floor(rng() * 40 - 20)
      shapes.push(
        `<rect x="${(-w / 2).toFixed(1)}" y="${(-h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${accent}" fill-opacity="${opacity}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})" />`
      )
    } else if (kind < 0.8) {
      const r = 20 + rng() * 60
      shapes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${accent}" fill-opacity="${opacity}" />`)
    } else {
      const x2 = x + (rng() * 160 - 80)
      const y2 = y + (rng() * 160 - 80)
      shapes.push(
        `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${accent}" stroke-opacity="${(Number(opacity) + 0.15).toFixed(2)}" stroke-width="${(2 + rng() * 3).toFixed(1)}" />`
      )
    }
  }
  return shapes.join('\n      ')
}

function buildGridLines(line) {
  const step = 40
  const lines = []
  for (let x = step; x < WIDTH; x += step) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}" stroke="${line}" stroke-width="1" stroke-opacity="0.35" />`)
  }
  for (let y = step; y < HEIGHT; y += step) {
    lines.push(`<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}" stroke="${line}" stroke-width="1" stroke-opacity="0.35" />`)
  }
  return lines.join('\n      ')
}

function buildSvg(mapName, paletteKey) {
  const palette = PALETTES[paletteKey]
  const rng = mulberry32(seedFromString(mapName))
  const label = escapeXml(mapName.toUpperCase())
  const compassX = WIDTH - 44
  const compassY = 44

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bgFrom}" />
      <stop offset="100%" stop-color="${palette.bgTo}" />
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55" />
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <g>
      ${buildGridLines(palette.line)}
  </g>
  <g>
      ${buildBlockoutShapes(rng, palette.accent)}
  </g>
  <g stroke="${palette.accent}" stroke-opacity="0.55" stroke-width="1.5" fill="none">
    <circle cx="${compassX}" cy="${compassY}" r="16" />
    <line x1="${compassX - 22}" y1="${compassY}" x2="${compassX + 22}" y2="${compassY}" />
    <line x1="${compassX}" y1="${compassY - 22}" x2="${compassX}" y2="${compassY + 22}" />
  </g>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette)" />
  <rect x="0" y="${HEIGHT - 56}" width="${Math.min(WIDTH, 40 + label.length * 19)}" height="56" fill="#0d100e" fill-opacity="0.55" />
  <text x="24" y="${HEIGHT - 20}" font-family="Fira Sans Condensed, DejaVu Sans Condensed, sans-serif" font-weight="800" font-size="30" letter-spacing="2" fill="#ecefe9">${label}</text>
</svg>
`
}

function ensureTool(bin) {
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' })
  } catch {
    console.error(`Required tool not found on PATH: ${bin}`)
    process.exit(1)
  }
}

function main() {
  ensureTool('rsvg-convert')
  ensureTool('magick')

  mkdirSync(OUT_DIR, { recursive: true })
  const work = join(tmpdir(), `map-thumbs-${Date.now()}`)
  mkdirSync(work, { recursive: true })

  for (const [mapName, paletteKey] of Object.entries(MAPS)) {
    const svg = buildSvg(mapName, paletteKey)
    const svgPath = join(work, `${mapName}.svg`)
    const pngPath = join(work, `${mapName}.png`)
    const webpPath = join(OUT_DIR, `${mapName}.webp`)

    writeFileSync(svgPath, svg)
    execFileSync('rsvg-convert', ['-w', String(WIDTH), '-h', String(HEIGHT), svgPath, '-o', pngPath])
    execFileSync('magick', [pngPath, '-quality', '82', webpPath])
    console.log(`generated ${webpPath}`)
  }

  rmSync(work, { recursive: true, force: true })
}

main()
