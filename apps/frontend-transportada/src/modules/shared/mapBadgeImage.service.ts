/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ICON_PATHS } from '@/components/ui/icon'

import type { MapBadgeKind } from './mapBadge.constant'
import { MAP_BADGE_ICONS, MAP_BADGE_SHAPES, type MapBadgeColors } from './mapBadge.service'

/** Lado do selo em pixel CSS; o canvas multiplica pela densidade da tela. */
const BADGE_SIDE = 24
const ICON_VIEWBOX = 24
const ICON_SHARE = 0.58
const BORDER_WIDTH = 2
const GLYPH_STROKE = 2
const SQUARE_RADIUS_SHARE = 0.28

/**
 * O selo desenhado em canvas: o MapLibre pinta em WebGL e só aceita imagem pronta. O ícone é
 * traçado com `Path2D` sobre os mesmos caminhos do `ICON_PATHS` — sem `data:` (a CSP de `img-src`
 * não o permite) e sem arquivo à parte que divergiria do design system.
 */
export function drawMapBadge(input: {
  readonly colors: MapBadgeColors
  readonly kind: MapBadgeKind
  readonly pixelRatio: number
}): ImageData {
  const side = BADGE_SIDE * input.pixelRatio
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('MAP_BADGE_CANVAS_UNAVAILABLE')

  const border = BORDER_WIDTH * input.pixelRatio
  traceBadgeShape({ border, context, kind: input.kind, side })
  context.fillStyle = input.colors.background
  context.fill()
  context.lineWidth = border
  context.strokeStyle = input.colors.border
  context.stroke()

  const iconSide = side * ICON_SHARE
  context.save()
  context.translate((side - iconSide) / 2, (side - iconSide) / 2)
  context.scale(iconSide / ICON_VIEWBOX, iconSide / ICON_VIEWBOX)
  context.lineWidth = GLYPH_STROKE
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = input.colors.glyph
  for (const pathData of ICON_PATHS[MAP_BADGE_ICONS[input.kind]]) {
    context.stroke(new Path2D(pathData))
  }
  context.restore()

  return context.getImageData(0, 0, side, side)
}

function traceBadgeShape(input: {
  readonly border: number
  readonly context: CanvasRenderingContext2D
  readonly kind: MapBadgeKind
  readonly side: number
}): void {
  const { border, context, side } = input
  const inset = border / 2
  context.beginPath()
  if (MAP_BADGE_SHAPES[input.kind] === 'circle') {
    context.arc(side / 2, side / 2, side / 2 - inset, 0, Math.PI * 2)
    return
  }
  context.roundRect(inset, inset, side - border, side - border, side * SQUARE_RADIUS_SHARE)
}
