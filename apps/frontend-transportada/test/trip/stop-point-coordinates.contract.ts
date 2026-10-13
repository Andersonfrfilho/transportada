/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { normalizeStopPointCoordinate } from '../../src/modules/trip/shared/stopPointCoordinates.service'

/**
 * A API só aceita `-?\d{1,3}(\.\d{1,7})?`. Coordenada copiada do Google Maps vem com vírgula
 * (teclado pt-BR) ou com mais de sete casas, e o `400` voltava sem motivo nenhum na tela.
 */
describe('coordenada do ponto da parada', () => {
  it('troca vírgula por ponto', () => {
    expect(normalizeStopPointCoordinate({ axis: 'latitude', value: '-21,0758798' })).toEqual({
      ok: true,
      value: '-21.0758798',
    })
  })

  it('limita a sete casas decimais', () => {
    expect(normalizeStopPointCoordinate({ axis: 'longitude', value: ' -47.902604123 ' })).toEqual({
      ok: true,
      value: '-47.9026041',
    })
  })

  it('recusa vazio, texto e fora do intervalo com o motivo', () => {
    expect(normalizeStopPointCoordinate({ axis: 'latitude', value: '' })).toEqual({
      ok: false,
      reason: 'empty',
    })
    expect(normalizeStopPointCoordinate({ axis: 'latitude', value: 'abc' })).toEqual({
      ok: false,
      reason: 'format',
    })
    expect(normalizeStopPointCoordinate({ axis: 'latitude', value: '91' })).toEqual({
      ok: false,
      reason: 'range',
    })
    expect(normalizeStopPointCoordinate({ axis: 'longitude', value: '-181' })).toEqual({
      ok: false,
      reason: 'range',
    })
  })
})
