/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import sharp from 'sharp'

/** O cabeçalho e a assinatura do e-mail são `#10222c`: o logo da empresa precisa ser lido sobre fundo escuro. */
const OPAQUE_BACKGROUND_SAMPLE = 4
/** 1% de pixels transparentes já diz que o desenho tem canal alfa próprio. */
const TRANSPARENT_SHARE = 0.01
/** Distância do fundo (0-255) a partir da qual o pixel já é totalmente opaco. */
const FULL_OPACITY_DISTANCE = 96
const MAX_SIDE = 512

/**
 * A silhueta branca do logo: o desenho vira branco e o fundo some. Logo com transparência mantém o próprio canal alfa;
 * logo opaco (JPG, ou PNG de fundo chapado) usa a cor dos quatro cantos como fundo e a distância a ela como opacidade.
 * O resultado é sempre PNG com alfa, no máximo 512 px de lado.
 */
export async function toWhiteLogoPng(bytes: Uint8Array): Promise<Buffer> {
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize({ fit: 'inside', height: MAX_SIDE, width: MAX_SIDE, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { height, width } = info
  const pixels = width * height
  let transparent = 0
  for (let index = 0; index < pixels; index += 1) {
    if ((data[index * 4 + 3] ?? 255) < 250) transparent += 1
  }

  const hasAlpha = transparent / pixels >= TRANSPARENT_SHARE
  const background = hasAlpha ? undefined : sampleBackground(data, width, height)
  const out = Buffer.alloc(pixels * 4, 255)
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4
    out[offset + 3] =
      background === undefined
        ? (data[offset + 3] ?? 255)
        : Math.min(
            255,
            Math.round((distance(data, offset, background) / FULL_OPACITY_DISTANCE) * 255),
          )
  }
  return sharp(out, { raw: { channels: 4, height, width } })
    .png()
    .toBuffer()
}

type Rgb = readonly [number, number, number]

function sampleBackground(data: Buffer, width: number, height: number): Rgb {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1]
  const sum = [0, 0, 0]
  for (const corner of corners.slice(0, OPAQUE_BACKGROUND_SAMPLE)) {
    for (let channel = 0; channel < 3; channel += 1) {
      sum[channel] = (sum[channel] ?? 0) + (data[corner * 4 + channel] ?? 0)
    }
  }
  return [
    Math.round((sum[0] ?? 0) / corners.length),
    Math.round((sum[1] ?? 0) / corners.length),
    Math.round((sum[2] ?? 0) / corners.length),
  ]
}

function distance(data: Buffer, offset: number, background: Rgb): number {
  return Math.max(
    Math.abs((data[offset] ?? 0) - background[0]),
    Math.abs((data[offset + 1] ?? 0) - background[1]),
    Math.abs((data[offset + 2] ?? 0) - background[2]),
  )
}
