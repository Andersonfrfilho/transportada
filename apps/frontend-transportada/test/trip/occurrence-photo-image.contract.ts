import { describe, expect, it } from 'bun:test'

import {
  attemptOccurrencePhotoThumbnail,
  buildOccurrencePhotoQualitySequence,
  computeOccurrencePhotoOriginalDimensions,
  computeOccurrencePhotoThumbnailDimensions,
  OCCURRENCE_PHOTO_MAX_SIDE,
  OCCURRENCE_THUMBNAIL_MAX_SIDE,
} from '../../src/modules/trip/shared/occurrencePhotoImage.service'

/**
 * Spec 161 T21 (RF29/D12): original ≤ 1600 px e miniatura ≤ 320 px, do mesmo canvas. `canvas.toBlob`
 * não roda no ambiente de teste, então só a conta de dimensões e a sequência de qualidade — puras,
 * determinísticas — são testadas aqui (mesmo molde de `field-delivery-image.contract.ts`).
 */
describe('dimensões da foto de ocorrência (spec 161 D12)', () => {
  it('original menor que o teto não muda de tamanho', () => {
    expect(computeOccurrencePhotoOriginalDimensions({ height: 800, width: 600 })).toEqual({
      height: 800,
      width: 600,
    })
  })

  it('original acima do teto reduz mantendo a proporção', () => {
    expect(computeOccurrencePhotoOriginalDimensions({ height: 3200, width: 1600 })).toEqual({
      height: OCCURRENCE_PHOTO_MAX_SIDE,
      width: 800,
    })
  })

  it('miniatura acima do teto reduz para 320 px no lado maior', () => {
    expect(computeOccurrencePhotoThumbnailDimensions({ height: 1600, width: 800 })).toEqual({
      height: OCCURRENCE_THUMBNAIL_MAX_SIDE,
      width: 160,
    })
  })

  it('miniatura nunca devolve dimensão zero em proporção extrema', () => {
    const result = computeOccurrencePhotoThumbnailDimensions({ height: 1, width: 5000 })
    expect(result.width).toBe(OCCURRENCE_THUMBNAIL_MAX_SIDE)
    expect(result.height).toBeGreaterThanOrEqual(1)
  })
})

describe('buildOccurrencePhotoQualitySequence (spec 161 T21)', () => {
  it('começa em 0.85 e desce em degraus de 0.1 até o piso 0.5', () => {
    expect(buildOccurrencePhotoQualitySequence()).toEqual([0.85, 0.75, 0.65, 0.55, 0.5])
  })

  it('nunca desce abaixo do piso de legibilidade', () => {
    expect(Math.min(...buildOccurrencePhotoQualitySequence())).toBe(0.5)
  })
})

/**
 * RF29b: falha na geração da miniatura (canvas indisponível, memória) envia só o original, sem
 * lançar — isolado aqui de `encode`, que em produção é quem toca o canvas.
 */
describe('attemptOccurrencePhotoThumbnail (spec 161 RF29b)', () => {
  it('devolve o blob quando o encode funciona', () => {
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    expect(attemptOccurrencePhotoThumbnail(() => Promise.resolve(blob))).resolves.toBe(blob)
  })

  it('devolve undefined, sem lançar, quando o encode falha', () => {
    expect(
      attemptOccurrencePhotoThumbnail(() =>
        Promise.reject(new Error('OCCURRENCE_PHOTO_CANVAS_UNAVAILABLE')),
      ),
    ).resolves.toBeUndefined()
  })
})
