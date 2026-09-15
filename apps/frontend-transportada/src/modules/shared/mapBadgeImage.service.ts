/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ICON_PATHS } from '@/components/ui/icon'

import type { MapBadgeKind } from './mapBadge.constant'
import {
  MAP_BADGE_ICONS,
  MAP_BADGE_SHAPES,
  type MapBadgeColors,
  type SpeedPlateColors,
} from './mapBadge.service'

/** Lado do selo em pixel CSS; o canvas multiplica pela densidade da tela. */
const BADGE_SIDE = 24
const PLATE_GAP = 3
const ICON_VIEWBOX = 24
const ICON_SHARE = 0.58
const BORDER_WIDTH = 2
const PLATE_RING_WIDTH = 3
const GLYPH_STROKE = 2
const SQUARE_RADIUS_SHARE = 0.28
const TWO_DIGIT_FONT_SHARE = 0.42
const THREE_DIGIT_FONT_SHARE = 0.34
const PLATE_FONT_FAMILY = 'sans-serif'

export type SpeedPlate = Readonly<{ colors: SpeedPlateColors; speed: string }>

/**
 * O selo desenhado em canvas: o MapLibre pinta em WebGL e só aceita imagem pronta. O ícone é
 * traçado com `Path2D` sobre os mesmos caminhos do `ICON_PATHS` — sem `data:` (a CSP de `img-src`
 * não o permite) e sem arquivo à parte que divergiria do design system. Com `speedPlate`, a placa
 * de velocidade vai ao lado, na mesma imagem.
 */
export function drawMapBadge(input: {
  readonly colors: MapBadgeColors
  readonly kind: MapBadgeKind
  readonly pixelRatio: number
  readonly speedPlate?: SpeedPlate
}): ImageData {
  const side = BADGE_SIDE * input.pixelRatio
  const plateOffset = side + PLATE_GAP * input.pixelRatio
  const canvas = document.createElement('canvas')
  canvas.width = input.speedPlate === undefined ? side : plateOffset + side
  canvas.height = side
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('MAP_BADGE_CANVAS_UNAVAILABLE')

  drawIconBadge({ colors: input.colors, context, kind: input.kind, pixelRatio: input.pixelRatio })
  if (input.speedPlate !== undefined) {
    drawSpeedPlate({
      context,
      left: plateOffset,
      pixelRatio: input.pixelRatio,
      plate: input.speedPlate,
    })
  }

  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function drawIconBadge(input: {
  readonly colors: MapBadgeColors
  readonly context: CanvasRenderingContext2D
  readonly kind: MapBadgeKind
  readonly pixelRatio: number
}): void {
  const { colors, context, kind, pixelRatio } = input
  const side = BADGE_SIDE * pixelRatio
  const border = BORDER_WIDTH * pixelRatio
  const inset = border / 2

  context.beginPath()
  if (MAP_BADGE_SHAPES[kind] === 'circle') {
    context.arc(side / 2, side / 2, side / 2 - inset, 0, Math.PI * 2)
  } else {
    context.roundRect(inset, inset, side - border, side - border, side * SQUARE_RADIUS_SHARE)
  }
  context.fillStyle = colors.background
  context.fill()
  context.lineWidth = border
  context.strokeStyle = colors.border
  context.stroke()

  const iconSide = side * ICON_SHARE
  context.save()
  context.translate((side - iconSide) / 2, (side - iconSide) / 2)
  context.scale(iconSide / ICON_VIEWBOX, iconSide / ICON_VIEWBOX)
  context.lineWidth = GLYPH_STROKE
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = colors.glyph
  for (const pathData of ICON_PATHS[MAP_BADGE_ICONS[kind]]) {
    context.stroke(new Path2D(pathData))
  }
  context.restore()
}

/** A R-19: círculo branco, anel vermelho grosso, o número em preto e negrito no centro. */
function drawSpeedPlate(input: {
  readonly context: CanvasRenderingContext2D
  readonly left: number
  readonly pixelRatio: number
  readonly plate: SpeedPlate
}): void {
  const { context, left, pixelRatio, plate } = input
  const side = BADGE_SIDE * pixelRatio
  const ring = PLATE_RING_WIDTH * pixelRatio
  const center = { x: left + side / 2, y: side / 2 }

  context.beginPath()
  context.arc(center.x, center.y, side / 2 - ring / 2, 0, Math.PI * 2)
  context.fillStyle = plate.colors.fill
  context.fill()
  context.lineWidth = ring
  context.strokeStyle = plate.colors.ring
  context.stroke()

  const fontShare = plate.speed.length > 2 ? THREE_DIGIT_FONT_SHARE : TWO_DIGIT_FONT_SHARE
  context.fillStyle = plate.colors.digits
  context.font = `bold ${Math.round(side * fontShare)}px ${PLATE_FONT_FAMILY}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(plate.speed, center.x, center.y + pixelRatio)
}
