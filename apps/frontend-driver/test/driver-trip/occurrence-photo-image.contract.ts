/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  OCCURRENCE_PHOTO_MAX_SIDE,
  OCCURRENCE_PHOTO_TARGET_BYTES,
  buildOccurrencePhotoQualitySequence,
  computeOccurrencePhotoOriginalDimensions,
} from '../../src/modules/driver-trip/shared/occurrencePhotoImage.service'
import { OCCURRENCE_PHOTO_MAX_BYTES } from '../../src/modules/driver-trip/shared/notDelivered.service'

/**
 * Spec 179 RNF ("os mesmos limites"), molde da spec 161 D12: a foto da ocorrência sai do celular
 * reencodada — lado maior até 1600 px, JPEG mirando 400 KiB, com folga até o teto de 512 KiB do
 * servidor. O canvas descarta o EXIF (e o GPS da foto) sozinho.
 */
describe('a foto da ocorrência reencodada no aparelho', () => {
  it('reduz pelo lado maior e não aumenta foto pequena', () => {
    expect(computeOccurrencePhotoOriginalDimensions({ height: 3000, width: 4000 })).toEqual({
      height: 1200,
      width: OCCURRENCE_PHOTO_MAX_SIDE,
    })
    expect(computeOccurrencePhotoOriginalDimensions({ height: 800, width: 600 })).toEqual({
      height: 800,
      width: 600,
    })
  })

  it('a qualidade desce em degraus até o piso de legibilidade', () => {
    expect(buildOccurrencePhotoQualitySequence()).toEqual([0.85, 0.75, 0.65, 0.55, 0.5])
  })

  it('o alvo tem folga até o teto do servidor', () => {
    expect(OCCURRENCE_PHOTO_TARGET_BYTES).toBeLessThan(OCCURRENCE_PHOTO_MAX_BYTES)
  })
})
