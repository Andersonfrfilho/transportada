/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ICON_PATHS } from '@/components/ui/icon'

import type { MapBadgeKind } from './mapBadge.constant'
import {
  MAP_BADGE_ICONS,
  MAP_BADGE_SHAPES,
  resolveMapBadgeColors,
  resolveSpeedPlateColors,
  type MapBadgeColors,
  type MapBadgeRequest,
  type SpeedPlateColors,
} from './mapBadge.service'
import type { BasemapTheme } from './vectorBasemap.service'

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
const PRICE_FONT_SHARE = 0.46
const PRICE_TRAILING_PADDING = 7
const PRICE_ICON_GAP = 1
const PLATE_FONT_FAMILY = 'sans-serif'

export type SpeedPlate = Readonly<{ colors: SpeedPlateColors; speed: string }>

type BadgeFrame = Readonly<{
  border: number
  iconShare: number
  left: number
  side: number
  top: number
}>

type GlyphInput = Readonly<{
  colors: MapBadgeColors
  context: CanvasRenderingContext2D
  frame: BadgeFrame
  kind: MapBadgeKind
}>

/**
 * A imagem que o mapa pediu: o selo sozinho, o radar com a placa de velocidade, ou a praça com a
 * etiqueta de preço. O componente só repassa o pedido — a regra de qual desenho vive aqui.
 */
export function drawRequestedMapBadge(input: {
  readonly pixelRatio: number
  readonly request: MapBadgeRequest
  readonly resolveToken: (token: string) => string
  readonly theme: BasemapTheme
}): ImageData {
  const { pixelRatio, request, resolveToken, theme } = input
  const colors = resolveMapBadgeColors({ kind: request.kind, resolveToken, theme })
  if (request.value === null) return drawMapBadge({ colors, kind: request.kind, pixelRatio })
  if (request.kind === 'toll') return drawPriceTag({ colors, pixelRatio, price: request.value })

  const speedPlate = { colors: resolveSpeedPlateColors(resolveToken), speed: request.value }
  return drawMapBadge({ colors, kind: request.kind, pixelRatio, speedPlate })
}

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
  const context = createCanvasContext({ height: canvasSide, width: canvasSide })

  if (speedPlate === undefined) {
    const border = BORDER_WIDTH * pixelRatio
    const frame = { border, iconShare: ICON_SHARE, left: 0, side, top: 0 }
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

  return context.getImageData(0, 0, canvasSide, canvasSide)
}

/**
 * A etiqueta da praça: o mesmo quadrado arredondado do selo, esticado para caber o valor por eixo
 * à direita do ícone — o preço dentro do marcador, não em texto solto ao lado dele.
 */
function drawPriceTag(input: {
  readonly colors: MapBadgeColors
  readonly pixelRatio: number
  readonly price: string
}): ImageData {
  const { colors, pixelRatio, price } = input
  const height = BADGE_SIDE * pixelRatio
  const font = `bold ${Math.round(height * PRICE_FONT_SHARE)}px ${PLATE_FONT_FAMILY}`
  const textWidth = Math.ceil(measureText({ font, text: price }))
  const width =
    height + PRICE_ICON_GAP * pixelRatio + textWidth + PRICE_TRAILING_PADDING * pixelRatio
  const context = createCanvasContext({ height, width })
  const border = BORDER_WIDTH * pixelRatio
  const inset = border / 2

  context.beginPath()
  context.roundRect(inset, inset, width - border, height - border, height * SQUARE_RADIUS_SHARE)
  context.fillStyle = colors.background
  context.fill()
  context.lineWidth = border
  context.strokeStyle = colors.border
  context.stroke()

  const frame = { border, iconShare: ICON_SHARE, left: 0, side: height, top: 0 }
  drawIconGlyph({ colors, context, frame, kind: 'toll' })

  context.fillStyle = colors.glyph
  context.font = font
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillText(price, height + PRICE_ICON_GAP * pixelRatio, height / 2 + pixelRatio)

  return context.getImageData(0, 0, width, height)
}

function drawIconBadge(input: GlyphInput): void {
  const { colors, context, frame, kind } = input
  const { border, left, side, top } = frame
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

  drawIconGlyph(input)
}

function drawIconGlyph(input: GlyphInput): void {
  const { colors, context, frame, kind } = input
  const { iconShare, left, side, top } = frame
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

function createCanvasContext(size: {
  readonly height: number
  readonly width: number
}): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('MAP_BADGE_CANVAS_UNAVAILABLE')
  return context
}

/** A largura do valor decide a da etiqueta: mede antes, num canvas de um pixel. */
function measureText(input: { readonly font: string; readonly text: string }): number {
  const context = createCanvasContext({ height: 1, width: 1 })
  context.font = input.font
  return context.measureText(input.text).width
}
