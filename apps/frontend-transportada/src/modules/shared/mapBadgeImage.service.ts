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
const ICON_VIEWBOX = 24
const ICON_SHARE = 0.62
const BORDER_WIDTH = 2
/**
 * A medalha do radar encaixada no canto da placa: menor, com borda mais fina, e o ícone ocupando
 * mais dela — abaixo disso o carro com as ondas vira borrão.
 */
const MEDAL_SIDE = 17
const MEDAL_ICON_SHARE = 0.74
const MEDAL_BORDER_WIDTH = 1.5
const MEDAL_OVERHANG = 8
const PLATE_RING_WIDTH = 3
const GLYPH_STROKE = 2
const SQUARE_RADIUS_SHARE = 0.28
const TWO_DIGIT_FONT_SHARE = 0.42
const THREE_DIGIT_FONT_SHARE = 0.34
const PLATE_FONT_FAMILY = 'sans-serif'

export type SpeedPlate = Readonly<{ colors: SpeedPlateColors; speed: string }>

type BadgeFrame = Readonly<{
  border: number
  iconShare: number
  left: number
  side: number
  top: number
}>

/**
 * O selo desenhado em canvas: o MapLibre pinta em WebGL e só aceita imagem pronta. O ícone é
 * traçado com `Path2D` sobre os mesmos caminhos do `ICON_PATHS` — sem `data:` (a CSP de `img-src`
 * não o permite) e sem arquivo à parte que divergiria do design system. Com `speedPlate`, a placa
 * de velocidade é o corpo do marcador e o selo do radar vira uma medalha no canto dela — uma peça
 * só, não duas lado a lado que o olho lê como marcadores diferentes.
 */
export function drawMapBadge(input: {
  readonly colors: MapBadgeColors
  readonly kind: MapBadgeKind
  readonly pixelRatio: number
  readonly speedPlate?: SpeedPlate
}): ImageData {
  const { colors, kind, pixelRatio, speedPlate } = input
  const side = BADGE_SIDE * pixelRatio
  const canvasSide = speedPlate === undefined ? side : (BADGE_SIDE + MEDAL_OVERHANG) * pixelRatio
  const canvas = document.createElement('canvas')
  canvas.width = canvasSide
  canvas.height = canvasSide
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('MAP_BADGE_CANVAS_UNAVAILABLE')

  if (speedPlate === undefined) {
    const frame = {
      border: BORDER_WIDTH * pixelRatio,
      iconShare: ICON_SHARE,
      left: 0,
      side,
      top: 0,
    }
    drawIconBadge({ colors, context, frame, kind })
  } else {
    drawSpeedPlate({ context, pixelRatio, plate: speedPlate })
    const medalSide = MEDAL_SIDE * pixelRatio
    const origin = canvasSide - medalSide
    const frame = {
      border: MEDAL_BORDER_WIDTH * pixelRatio,
      iconShare: MEDAL_ICON_SHARE,
      left: origin,
      side: medalSide,
      top: origin,
    }
    drawIconBadge({ colors, context, frame, kind })
  }

  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function drawIconBadge(input: {
  readonly colors: MapBadgeColors
  readonly context: CanvasRenderingContext2D
  readonly frame: BadgeFrame
  readonly kind: MapBadgeKind
}): void {
  const { colors, context, frame, kind } = input
  const { border, iconShare, left, side, top } = frame
  const inset = border / 2

  context.beginPath()
  if (MAP_BADGE_SHAPES[kind] === 'circle') {
    context.arc(left + side / 2, top + side / 2, side / 2 - inset, 0, Math.PI * 2)
  } else {
    const radius = side * SQUARE_RADIUS_SHARE
    context.roundRect(left + inset, top + inset, side - border, side - border, radius)
  }
  context.fillStyle = colors.background
  context.fill()
  context.lineWidth = border
  context.strokeStyle = colors.border
  context.stroke()

  const iconSide = side * iconShare
  context.save()
  context.translate(left + (side - iconSide) / 2, top + (side - iconSide) / 2)
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
  readonly pixelRatio: number
  readonly plate: SpeedPlate
}): void {
  const { context, pixelRatio, plate } = input
  const side = BADGE_SIDE * pixelRatio
  const ring = PLATE_RING_WIDTH * pixelRatio
  const center = side / 2

  context.beginPath()
  context.arc(center, center, side / 2 - ring / 2, 0, Math.PI * 2)
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
  context.fillText(plate.speed, center, center + pixelRatio)
}
