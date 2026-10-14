/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 RNF1/RNF2: as dimensões e a orientação saem do cabeçalho (sem alocar pixel), a orientação
 * EXIF vira pixel e a escada de qualidade respeita o alvo e o teto.
 */
import { describe, expect, test } from 'bun:test'

import {
  exceedsPixelCeiling,
  isImageOverPixelCeiling,
  readImageDimensions,
  readJpegOrientation,
} from '../../src/delivery-proof-processing/domain/image-header.policy.js'
import {
  applyOrientation,
  encodeWithinBudget,
  fitWithin,
  flattenAlphaOntoWhite,
  resizeBox,
  type EncodingPlan,
  type RgbaImage,
} from '../../src/delivery-proof-processing/domain/image-transform.policy.js'
import {
  buildCanhotoPhoto,
  buildExifSegment,
  buildJpegHeaderClaiming,
  withExif,
} from '../fixtures/delivery-proof-photo.fixture.js'

describe('cabeçalho da imagem', () => {
  test('lê as dimensões de JPEG, PNG e WebP sem decodificar', async () => {
    for (const [format, mediaType] of [
      ['jpeg', 'image/jpeg'],
      ['png', 'image/png'],
      ['webp', 'image/webp'],
    ] as const) {
      const bytes = await buildCanhotoPhoto({
        format,
        hasBarcode: false,
        heightPixels: 300,
        moduleWidthPixels: 2,
        widthPixels: 500,
      })

      expect(readImageDimensions(bytes, mediaType)).toEqual({ height: 300, width: 500 })
    }
  })

  test('bytes que não são imagem não têm dimensões', () => {
    expect(readImageDimensions(new Uint8Array(64).fill(1), 'image/jpeg')).toBeNull()
    expect(readImageDimensions(new Uint8Array(0), 'image/png')).toBeNull()
    expect(readImageDimensions(new Uint8Array(30), 'image/webp')).toBeNull()
    expect(readImageDimensions(new Uint8Array(30), 'image/gif')).toBeNull()
  })

  test('JPEG de poucos bytes que declara 60000 × 60000 estoura o teto de pixels', () => {
    const bomb = buildJpegHeaderClaiming(60_000, 60_000)

    expect(bomb.byteLength).toBeLessThan(64)
    expect(readImageDimensions(bomb, 'image/jpeg')).toEqual({ height: 60_000, width: 60_000 })
    expect(isImageOverPixelCeiling(bomb, 'image/jpeg')).toBe(true)
    expect(exceedsPixelCeiling({ height: 4032, width: 3024 })).toBe(false)
  })

  test('cabeçalho ilegível não é "acima do teto": quem decodifica é que o recusa', () => {
    expect(isImageOverPixelCeiling(new Uint8Array(64).fill(1), 'image/jpeg')).toBe(false)
  })

  test('a orientação EXIF sai dos dois sentidos de byte e cai em 1 sem EXIF ou com valor inválido', async () => {
    const jpeg = await buildCanhotoPhoto({
      format: 'jpeg',
      hasBarcode: false,
      heightPixels: 100,
      moduleWidthPixels: 2,
      widthPixels: 200,
    })

    expect(readJpegOrientation(jpeg)).toBe(1)
    for (const orientation of [2, 3, 6, 8]) {
      for (const littleEndian of [false, true]) {
        const tagged = withExif(jpeg, buildExifSegment({ littleEndian, orientation }))
        expect(readJpegOrientation(tagged)).toBe(orientation)
      }
    }
    expect(readJpegOrientation(withExif(jpeg, buildExifSegment({ orientation: 9 })))).toBe(1)
    expect(readJpegOrientation(new Uint8Array([1, 2, 3]))).toBe(1)
  })
})

/** 2 × 1: pixel esquerdo vermelho, direito azul. */
function twoByOne(): RgbaImage {
  return {
    data: Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 255, 255]),
    height: 1,
    width: 2,
  }
}

function colorsOf(image: RgbaImage): string[] {
  const colors: string[] = []
  for (let offset = 0; offset < image.data.length; offset += 4) {
    colors.push(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`)
  }
  return colors
}

const RED = '255,0,0'
const BLUE = '0,0,255'

describe('orientação aplicada aos pixels', () => {
  test('1 devolve a mesma imagem, sem cópia', () => {
    const image = twoByOne()
    expect(applyOrientation(image, 1)).toBe(image)
  })

  test('2 espelha na horizontal e 3 gira 180°', () => {
    expect(colorsOf(applyOrientation(twoByOne(), 2))).toEqual([BLUE, RED])
    expect(colorsOf(applyOrientation(twoByOne(), 3))).toEqual([BLUE, RED])
  })

  test('4 espelha na vertical (2 × 1 não muda)', () => {
    expect(colorsOf(applyOrientation(twoByOne(), 4))).toEqual([RED, BLUE])
  })

  test('6 gira 90° no sentido horário: a imagem fica em pé e o vermelho (esquerda) vai para o topo', () => {
    const rotated = applyOrientation(twoByOne(), 6)

    expect({ height: rotated.height, width: rotated.width }).toEqual({ height: 2, width: 1 })
    expect(colorsOf(rotated)).toEqual([RED, BLUE])
  })

  test('8 gira 90° no sentido anti-horário: o azul (direita) vai para o topo', () => {
    const rotated = applyOrientation(twoByOne(), 8)

    expect({ height: rotated.height, width: rotated.width }).toEqual({ height: 2, width: 1 })
    expect(colorsOf(rotated)).toEqual([BLUE, RED])
  })

  test('5 e 7 também trocam largura e altura', () => {
    for (const orientation of [5, 7]) {
      const rotated = applyOrientation(twoByOne(), orientation)
      expect({ height: rotated.height, width: rotated.width }).toEqual({ height: 2, width: 1 })
    }
    expect(colorsOf(applyOrientation(twoByOne(), 5))).toEqual([RED, BLUE])
    expect(colorsOf(applyOrientation(twoByOne(), 7))).toEqual([BLUE, RED])
  })
})

describe('redução', () => {
  test('o lado maior cabe em maxSide e nunca amplia', () => {
    expect(fitWithin({ height: 4032, maxSide: 2000, width: 3024 })).toEqual({
      height: 2000,
      width: 1500,
    })
    expect(fitWithin({ height: 300, maxSide: 2000, width: 500 })).toEqual({
      height: 300,
      width: 500,
    })
  })

  test('média de caixa: 2 × 2 de preto e branco vira cinza', () => {
    const image: RgbaImage = {
      data: Uint8ClampedArray.from([
        0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
      ]),
      height: 2,
      width: 2,
    }

    const reduced = resizeBox(image, { height: 1, width: 1 })

    // 127,5 arredonda para o par (Uint8ClampedArray): 128.
    expect(Array.from(reduced.data)).toEqual([128, 128, 128, 255])
  })

  test('transparente vira papel branco, e opaco não muda', () => {
    const image: RgbaImage = {
      data: Uint8ClampedArray.from([0, 0, 0, 0, 10, 20, 30, 255]),
      height: 1,
      width: 2,
    }

    flattenAlphaOntoWhite(image)

    expect(Array.from(image.data)).toEqual([255, 255, 255, 255, 10, 20, 30, 255])
  })
})

describe('escada de qualidade', () => {
  const plan: EncodingPlan = {
    maxBytes: 1000,
    maxSide: 100,
    maxSideShrinks: 2,
    minQuality: 40,
    qualityStep: 10,
    shrinkFactor: 0.5,
    startQuality: 80,
    targetBytes: 600,
  }
  const image: RgbaImage = {
    data: new Uint8ClampedArray(200 * 100 * 4),
    height: 100,
    width: 200,
  }

  test('a primeira qualidade que cabe no alvo vence, da melhor para a pior', async () => {
    const asked: number[] = []
    const result = await encodeWithinBudget({
      encode: async (_image, quality) => {
        asked.push(quality)
        return new Uint8Array(quality * 10)
      },
      image,
      plan,
    })

    expect(asked).toEqual([80, 70, 60])
    expect(result?.quality).toBe(60)
    expect(result?.bytes.byteLength).toBe(600)
    expect({ height: result?.height, width: result?.width }).toEqual({ height: 50, width: 100 })
  })

  test('no piso de qualidade, o que couber no teto ainda serve', async () => {
    const result = await encodeWithinBudget({
      encode: async () => new Uint8Array(900),
      image,
      plan,
    })

    expect(result?.quality).toBe(40)
    expect(result?.bytes.byteLength).toBe(900)
  })

  test('acima do teto mesmo no piso, o lado encolhe e a escada recomeça', async () => {
    const sides: number[] = []
    const result = await encodeWithinBudget({
      encode: async (scaled) => {
        sides.push(Math.max(scaled.width, scaled.height))
        return new Uint8Array(Math.max(scaled.width, scaled.height) * 12)
      },
      image,
      plan: { ...plan, maxSide: 200 },
    })

    // 200 px → 2400 B (acima de 1000 em toda qualidade); 100 px → 1200 B; 50 px → 600 B cabe no alvo.
    expect(new Set(sides)).toEqual(new Set([200, 100, 50]))
    expect(result?.width).toBe(50)
  })

  test('não coube nem no menor lado: null, e nunca devolve o que estoura o teto', async () => {
    const result = await encodeWithinBudget({
      encode: async () => new Uint8Array(plan.maxBytes + 1),
      image,
      plan,
    })

    expect(result).toBeNull()
  })
})
