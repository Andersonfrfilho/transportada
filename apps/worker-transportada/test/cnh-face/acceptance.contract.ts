/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: a foto só é aplicada com rosto único, nota ≥ 0,98 e lado curto ≥ 120 px.
 */
import { describe, expect, test } from 'bun:test'

import { isAcceptableCnhFace } from '../../src/cnh-face/domain/cnh-face-acceptance.policy.js'
import { portraitCropAround } from '../../src/cnh-face/infrastructure/cnh-face-crop.js'
import type { CnhFaceResult } from '../../src/cnh-face/domain/cnh-face.types.js'

const ACCEPTED: CnhFaceResult = {
  candidateImages: 1,
  cropShortSide: 120,
  faceScore: 0.98,
  facesFound: 1,
  outcome: 'extracted',
  sourceKind: 'image',
  webp: new Uint8Array([1]),
}

describe('quando a foto da CNH é aceita', () => {
  test('o limite exato (0,98 e 120 px) é aceito', () => {
    expect(isAcceptableCnhFace(ACCEPTED)).toBe(true)
  })

  test.each([
    ['nota abaixo de 0,98', { faceScore: 0.9799 }],
    ['recorte abaixo de 120 px', { cropShortSide: 119 }],
    ['mais de um rosto', { facesFound: 2 }],
    ['desfecho que não é extracted', { outcome: 'too_small' as const }],
    ['sem imagem', { webp: undefined }],
    ['sem nota', { faceScore: undefined }],
  ] as const)('recusa %s', (_label, override) => {
    expect(isAcceptableCnhFace({ ...ACCEPTED, ...override })).toBe(false)
  })
})

describe('recorte 3:4 em volta do rosto', () => {
  const image = { height: 680, rgb: Buffer.alloc(0), width: 963 }

  test('fica dentro da imagem mesmo com o rosto na borda', () => {
    const crop = portraitCropAround({ score: 1, x1: 0, x2: 130, y1: 0, y2: 160 }, image)

    expect(crop.left).toBeGreaterThanOrEqual(0)
    expect(crop.top).toBeGreaterThanOrEqual(0)
    expect(crop.left + crop.width).toBeLessThanOrEqual(image.width)
    expect(crop.top + crop.height).toBeLessThanOrEqual(image.height)
  })

  test('tem folga de 1,7x a largura do rosto e proporção 3:4', () => {
    const crop = portraitCropAround({ score: 1, x1: 400, x2: 530, y1: 200, y2: 360 }, image)

    expect(crop.width).toBe(Math.floor(130 * 1.7))
    expect(crop.height).toBe(Math.floor(130 * 1.7 * (4 / 3)))
  })
})
