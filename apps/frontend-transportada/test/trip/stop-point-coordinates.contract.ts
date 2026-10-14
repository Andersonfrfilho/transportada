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

describe('busca do ponto da parada', () => {
  const base = {
    city: '',
    district: '',
    label: '',
    number: '',
    postalCode: '',
    state: 'SP',
    street: '',
  }

  it('só aceita resultado da cidade da parada e com coordenada', async () => {
    const { pickStopPointSuggestion } = await import(
      '../../src/modules/trip/shared/stopPointSearch.service'
    )
    const outra = { ...base, city: 'Ribeirão Preto', latitude: '-21.1', longitude: '-47.8' }
    const semPonto = { ...base, city: 'Sertãozinho', latitude: null, longitude: null }
    const certa = {
      ...base,
      city: 'Sertãozinho',
      latitude: '-21.0758798',
      longitude: '-47.9026041',
    }
    const label = 'RUA GENERAL OSORIO, 971, SERTAOZINHO, SP'

    expect(pickStopPointSuggestion({ label, suggestions: [outra, semPonto, certa] })).toBe(certa)
    expect(pickStopPointSuggestion({ label, suggestions: [outra, semPonto] })).toBeNull()
  })
})

describe('endereços do 422 de rota', () => {
  it('lê os endereços de TRIP_ROUTE_STOPS_WITHOUT_LOCATION e ignora outros erros', async () => {
    const { readRouteStopsWithoutLocation } = await import(
      '../../src/modules/trip/shared/stopPointCoordinates.service'
    )
    const error = Object.assign(new Error('TRIP_ROUTE_STOPS_WITHOUT_LOCATION'), {
      details: [
        { field: 'stops', message: 'RUA A, 1' },
        { field: 'stops', message: 'RUA B, 2' },
      ],
    })

    expect(readRouteStopsWithoutLocation(error)).toEqual(['RUA A, 1', 'RUA B, 2'])
    expect(readRouteStopsWithoutLocation(new Error('TRIP_ROUTE_UNAVAILABLE'))).toEqual([])
    expect(readRouteStopsWithoutLocation(null)).toEqual([])
  })
})
