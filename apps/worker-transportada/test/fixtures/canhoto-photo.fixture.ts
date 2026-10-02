/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Foto de canhoto fabricada para o contrato do leitor. A tabela e o `encodeCode128C` são cópia **por
 * valor** do gerador do frontend (`code128.service.ts`): o worker não importa código de outra app, e
 * é o gerador de quem desenha o código no papel que prova que a leitura devolve os 44 caracteres.
 *
 * A foto é "de verdade": barra sólida sobre papel levemente granulado, como o spike T4.1 mediu. Ruído
 * dentro da barra inventaria um defeito que o JPEG com perda destrói e que a câmera não produz.
 */
import encodeJpeg from '@jsquash/jpeg/encode.js'
import encodePng from '@jsquash/png/encode.js'
import encodeWebp from '@jsquash/webp/encode.js'

const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
] as const

const START_CODE_C = 105
const STOP_VALUE = 106
const CHECKSUM_MODULUS = 103

function encodeCode128C(digits: string): readonly number[] {
  const values: number[] = [START_CODE_C]
  for (let index = 0; index < digits.length; index += 2) {
    values.push(Number(digits.slice(index, index + 2)))
  }
  const checksum = values.reduce(
    (total, value, position) => total + value * (position === 0 ? 1 : position),
    0,
  )
  values.push(checksum % CHECKSUM_MODULUS, STOP_VALUE)

  return values.flatMap((value) => [...(CODE128_PATTERNS[value] ?? '')].map(Number))
}

export const CANHOTO_PHOTO_ACCESS_KEY = '35240912345678000199550010000123451876543212'

const PAPER_BASE_LEVEL = 228
const PAPER_GRAIN_LEVELS = 12
const BAR_LEVEL = 28
const BAR_HEIGHT_PIXELS = 260
const BAR_TOP_PIXELS = 400
const BAR_LEFT_PIXELS = 300

export type CanhotoPhotoFormat = 'jpeg' | 'png' | 'webp'

export type BuildCanhotoPhotoParams = Readonly<{
  format: CanhotoPhotoFormat
  hasBarcode: boolean
  heightPixels: number
  moduleWidthPixels: number
  widthPixels: number
}>

export const REALISTIC_CAMERA_PHOTO = {
  format: 'jpeg',
  hasBarcode: true,
  heightPixels: 4032,
  moduleWidthPixels: 4,
  widthPixels: 3024,
} as const satisfies BuildCanhotoPhotoParams

export async function buildCanhotoPhoto(params: BuildCanhotoPhotoParams): Promise<Uint8Array> {
  const { heightPixels, widthPixels } = params
  const rgba = new Uint8ClampedArray(widthPixels * heightPixels * 4)
  for (let pixel = 0; pixel < widthPixels * heightPixels; pixel += 1) {
    const level = PAPER_BASE_LEVEL + Math.floor(Math.random() * PAPER_GRAIN_LEVELS)
    rgba.fill(level, pixel * 4, pixel * 4 + 3)
    rgba[pixel * 4 + 3] = 255
  }
  if (params.hasBarcode) drawBars({ params, rgba })

  const image = { colorSpace: 'srgb', data: rgba, height: heightPixels, width: widthPixels }
  const encoded = await encode({ format: params.format, image: image as unknown as ImageData })
  return new Uint8Array(encoded)
}

function drawBars(input: {
  readonly params: BuildCanhotoPhotoParams
  readonly rgba: Uint8ClampedArray
}): void {
  const { params, rgba } = input
  let left = BAR_LEFT_PIXELS
  let isBar = true
  for (const modules of encodeCode128C(CANHOTO_PHOTO_ACCESS_KEY)) {
    const barWidth = modules * params.moduleWidthPixels
    if (isBar) {
      for (let row = BAR_TOP_PIXELS; row < BAR_TOP_PIXELS + BAR_HEIGHT_PIXELS; row += 1) {
        const start = (row * params.widthPixels + left) * 4
        for (let column = 0; column < barWidth; column += 1) {
          rgba.fill(BAR_LEVEL, start + column * 4, start + column * 4 + 3)
        }
      }
    }
    left += barWidth
    isBar = !isBar
  }
}

async function encode(input: {
  readonly format: CanhotoPhotoFormat
  readonly image: ImageData
}): Promise<ArrayBuffer> {
  if (input.format === 'jpeg') return encodeJpeg(input.image, { quality: 85 })
  if (input.format === 'png') return encodePng(input.image)
  return encodeWebp(input.image, { quality: 85 })
}
