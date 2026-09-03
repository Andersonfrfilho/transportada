/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 082 D5: o recorte do comprovante acontece no aparelho, sem dependência nova. A detecção é a
 * mais simples que resolve o caso real — canhoto claro sobre fundo escuro (assoalho do caminhão,
 * prancheta): limiar de luminância e o maior retângulo claro por varredura.
 *
 * O que ela **não** promete: perspectiva, rotação, documento escuro sobre fundo claro. Quando o
 * contraste não separa nada, a resposta é `null` — e a tela oferece o original, nunca um recorte
 * inventado.
 */
export type CropBounds = Readonly<{
  bottom: number
  left: number
  right: number
  top: number
}>

export type LuminanceGrid = Readonly<{
  /** Luminância 0–255 por pixel, linha a linha — `data[y * width + x]`. */
  data: readonly number[] | Uint8ClampedArray
  height: number
  width: number
}>

/** RGBA de `ImageData` vira luminância: é o único formato que o canvas entrega. */
export function toLuminanceGrid(imageData: {
  readonly data: Uint8ClampedArray
  readonly height: number
  readonly width: number
}): LuminanceGrid {
  const pixels = imageData.width * imageData.height
  const data = new Uint8ClampedArray(pixels)
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4
    data[index] =
      0.299 * (imageData.data[offset] ?? 0) +
      0.587 * (imageData.data[offset + 1] ?? 0) +
      0.114 * (imageData.data[offset + 2] ?? 0)
  }
  return { data, height: imageData.height, width: imageData.width }
}

const MINIMUM_CONTRAST = 30
const MINIMUM_COVERAGE = 0.02
const MAXIMUM_COVERAGE = 0.95

/**
 * O maior retângulo claro: caixa envolvente dos pixels acima do limiar (média entre o claro e o
 * escuro médios). Sem contraste que separe (`null`), ou com o claro tomando a imagem inteira —
 * documento já enquadrado —, não há o que recortar.
 */
export function detectDocumentBounds(grid: LuminanceGrid): CropBounds | null {
  const total = grid.width * grid.height
  if (total === 0) return null

  let sum = 0
  let minimum = 255
  let maximum = 0
  for (let index = 0; index < total; index += 1) {
    const value = grid.data[index] ?? 0
    sum += value
    if (value < minimum) minimum = value
    if (value > maximum) maximum = value
  }
  if (maximum - minimum < MINIMUM_CONTRAST) return null

  const threshold = sum / total
  let top = grid.height
  let bottom = -1
  let left = grid.width
  let right = -1
  let brightCount = 0
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if ((grid.data[y * grid.width + x] ?? 0) <= threshold) continue
      brightCount += 1
      if (y < top) top = y
      if (y > bottom) bottom = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }

  if (bottom < 0) return null
  const coverage = brightCount / total
  if (coverage < MINIMUM_COVERAGE || coverage > MAXIMUM_COVERAGE) return null

  return { bottom: bottom + 1, left, right: right + 1, top }
}

export type CropCorners = Readonly<{
  bottomLeft: Readonly<{ x: number; y: number }>
  bottomRight: Readonly<{ x: number; y: number }>
  topLeft: Readonly<{ x: number; y: number }>
  topRight: Readonly<{ x: number; y: number }>
}>

export function boundsToCorners(bounds: CropBounds): CropCorners {
  return {
    bottomLeft: { x: bounds.left, y: bounds.bottom },
    bottomRight: { x: bounds.right, y: bounds.bottom },
    topLeft: { x: bounds.left, y: bounds.top },
    topRight: { x: bounds.right, y: bounds.top },
  }
}

/**
 * O ajuste manual arrasta os quatro cantos, mas o upload recorta por retângulo: vale a caixa
 * envolvente dos cantos, presa aos limites da imagem e com pelo menos um pixel de área.
 */
export function cornersToBounds(input: {
  readonly corners: CropCorners
  readonly height: number
  readonly width: number
}): CropBounds {
  const xs = [
    input.corners.topLeft.x,
    input.corners.topRight.x,
    input.corners.bottomLeft.x,
    input.corners.bottomRight.x,
  ]
  const ys = [
    input.corners.topLeft.y,
    input.corners.topRight.y,
    input.corners.bottomLeft.y,
    input.corners.bottomRight.y,
  ]
  const clampX = (value: number): number => Math.min(Math.max(Math.round(value), 0), input.width)
  const clampY = (value: number): number => Math.min(Math.max(Math.round(value), 0), input.height)

  const left = clampX(Math.min(...xs))
  const top = clampY(Math.min(...ys))
  return {
    bottom: Math.max(clampY(Math.max(...ys)), top + 1),
    left,
    right: Math.max(clampX(Math.max(...xs)), left + 1),
    top,
  }
}
