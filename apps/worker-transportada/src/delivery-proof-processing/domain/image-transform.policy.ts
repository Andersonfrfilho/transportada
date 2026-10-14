/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 RF5: as contas sobre pixels RGBA do tratamento do comprovante — orientação EXIF, redução por
 * média de caixa e a escada de qualidade do JPEG. Funções puras, sem I/O e sem decodificador: o
 * codec entra por parâmetro, e o contrato roda a escada sem wasm nenhum.
 *
 * ⚠️ Reencodar descarta o EXIF/GPS por construção (RNF2) — mas também descarta a orientação. Por isso
 * ela é aplicada aos pixels **antes** (`applyOrientation`); o canvas do aparelho faz o mesmo ao desenhar.
 */

export type RgbaImage = Readonly<{ data: Uint8ClampedArray; height: number; width: number }>

export type EncodedImage = Readonly<{
  bytes: Uint8Array
  height: number
  quality: number
  width: number
}>

export type JpegEncoder = (image: RgbaImage, quality: number) => Promise<Uint8Array>

export type EncodingPlan = Readonly<{
  maxBytes: number
  maxSide: number
  maxSideShrinks: number
  minQuality: number
  qualityStep: number
  shrinkFactor: number
  startQuality: number
  targetBytes: number
}>

const OPAQUE = 255

/** PNG e WebP têm alfa; JPEG não. Transparente vira papel branco, como o canvas com fundo branco. */
export function flattenAlphaOntoWhite(image: RgbaImage): void {
  const { data } = image
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] ?? OPAQUE
    if (alpha === OPAQUE) continue
    const inverse = OPAQUE - alpha
    data[offset] = ((data[offset] ?? 0) * alpha + OPAQUE * inverse) / OPAQUE
    data[offset + 1] = ((data[offset + 1] ?? 0) * alpha + OPAQUE * inverse) / OPAQUE
    data[offset + 2] = ((data[offset + 2] ?? 0) * alpha + OPAQUE * inverse) / OPAQUE
    data[offset + 3] = OPAQUE
  }
}

/** Para cada pixel de destino, de onde vem o de origem (orientação EXIF 2 a 8). */
function sourceIndex(input: {
  readonly destinationX: number
  readonly destinationY: number
  readonly height: number
  readonly orientation: number
  readonly width: number
}): { readonly x: number; readonly y: number } {
  const { destinationX: dx, destinationY: dy, height, orientation, width } = input
  switch (orientation) {
    case 2:
      return { x: width - 1 - dx, y: dy }
    case 3:
      return { x: width - 1 - dx, y: height - 1 - dy }
    case 4:
      return { x: dx, y: height - 1 - dy }
    case 5:
      return { x: dy, y: dx }
    case 6:
      return { x: dy, y: height - 1 - dx }
    case 7:
      return { x: width - 1 - dy, y: height - 1 - dx }
    case 8:
      return { x: width - 1 - dy, y: dx }
    default:
      return { x: dx, y: dy }
  }
}

/** Orientação 1 (ou desconhecida) devolve a própria imagem, sem cópia. */
export function applyOrientation(image: RgbaImage, orientation: number): RgbaImage {
  if (orientation < 2 || orientation > 8) return image
  const swaps = orientation >= 5
  const width = swaps ? image.height : image.width
  const height = swaps ? image.width : image.height
  const source = new Uint32Array(
    image.data.buffer,
    image.data.byteOffset,
    image.width * image.height,
  )
  const output = new Uint8ClampedArray(width * height * 4)
  const destination = new Uint32Array(output.buffer)

  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      const origin = sourceIndex({
        destinationX: dx,
        destinationY: dy,
        height: image.height,
        orientation,
        width: image.width,
      })
      destination[dy * width + dx] = source[origin.y * image.width + origin.x] ?? 0
    }
  }

  return { data: output, height, width }
}

/** O lado maior cabe em `maxSide`; nunca amplia. */
export function fitWithin(input: {
  readonly height: number
  readonly maxSide: number
  readonly width: number
}): { readonly height: number; readonly width: number } {
  const longest = Math.max(input.width, input.height)
  if (longest <= input.maxSide) return { height: input.height, width: input.width }
  const scale = input.maxSide / longest
  return {
    height: Math.max(1, Math.round(input.height * scale)),
    width: Math.max(1, Math.round(input.width * scale)),
  }
}

/** Média de caixa: cada pixel de destino é a média da faixa de origem que ele cobre. Só reduz. */
export function resizeBox(
  image: RgbaImage,
  target: { readonly height: number; readonly width: number },
): RgbaImage {
  if (target.width === image.width && target.height === image.height) return image
  const output = new Uint8ClampedArray(target.width * target.height * 4)
  const columnStart = new Int32Array(target.width + 1)
  for (let column = 0; column <= target.width; column += 1) {
    columnStart[column] = Math.floor((column * image.width) / target.width)
  }

  for (let row = 0; row < target.height; row += 1) {
    const firstRow = Math.floor((row * image.height) / target.height)
    const lastRow = Math.max(firstRow + 1, Math.floor(((row + 1) * image.height) / target.height))
    for (let column = 0; column < target.width; column += 1) {
      const firstColumn = columnStart[column] ?? 0
      const lastColumn = Math.max(firstColumn + 1, columnStart[column + 1] ?? firstColumn + 1)
      let red = 0
      let green = 0
      let blue = 0
      let count = 0
      for (let sourceRow = firstRow; sourceRow < lastRow; sourceRow += 1) {
        let offset = (sourceRow * image.width + firstColumn) * 4
        for (let sourceColumn = firstColumn; sourceColumn < lastColumn; sourceColumn += 1) {
          red += image.data[offset] ?? 0
          green += image.data[offset + 1] ?? 0
          blue += image.data[offset + 2] ?? 0
          count += 1
          offset += 4
        }
      }
      const destination = (row * target.width + column) * 4
      output[destination] = red / count
      output[destination + 1] = green / count
      output[destination + 2] = blue / count
      output[destination + 3] = OPAQUE
    }
  }

  return { data: output, height: target.height, width: target.width }
}

/**
 * A escada da 212: da melhor qualidade para baixo, a primeira que cabe no alvo vence; no piso de
 * qualidade, o que couber no teto ainda serve; senão o lado encolhe e a escada recomeça. `null` é "não
 * coube nem no menor lado" — falha permanente do arquivo, não do trilho.
 */
export async function encodeWithinBudget(input: {
  readonly encode: JpegEncoder
  readonly image: RgbaImage
  readonly plan: EncodingPlan
}): Promise<EncodedImage | null> {
  const { encode, image, plan } = input
  let maxSide = plan.maxSide
  let previousLongest = 0

  for (let shrink = 0; shrink <= plan.maxSideShrinks; shrink += 1) {
    const fitted = fitWithin({ height: image.height, maxSide, width: image.width })
    // Imagem já menor que o lado encolhido: repetir a escada no mesmo tamanho gasta CPU à toa.
    if (Math.max(fitted.width, fitted.height) === previousLongest) return null
    previousLongest = Math.max(fitted.width, fitted.height)
    const scaled = resizeBox(image, fitted)
    let lowest: EncodedImage | undefined

    for (let quality = plan.startQuality; quality >= plan.minQuality; quality -= plan.qualityStep) {
      const bytes = await encode(scaled, quality)
      lowest = { bytes, height: scaled.height, quality, width: scaled.width }
      if (bytes.byteLength <= plan.targetBytes) return lowest
    }

    if (lowest !== undefined && lowest.bytes.byteLength <= plan.maxBytes) return lowest
    maxSide = Math.floor(maxSide * plan.shrinkFactor)
  }

  return null
}
