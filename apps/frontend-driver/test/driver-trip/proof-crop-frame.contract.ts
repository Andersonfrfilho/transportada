/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { resolveInitialCropBounds } from '@/modules/driver-trip/shared/proofCropFrame.service'

describe('o retângulo inicial do recorte', () => {
  it('sem detecção, abre centrado com margem de 8% — nunca a imagem inteira', () => {
    expect(resolveInitialCropBounds({ detected: null, height: 400, width: 300 })).toEqual({
      bottom: 368,
      left: 24,
      right: 276,
      top: 32,
    })
  })

  it('com detecção, usa o retângulo detectado como está', () => {
    const detected = { bottom: 80, left: 25, right: 75, top: 20 }
    expect(resolveInitialCropBounds({ detected, height: 100, width: 100 })).toEqual(detected)
  })
})
