/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { toRouteSuggestion } from '../../src/modules/routing/shared/routeSuggestionResponse.validation'
import { READY_SUGGESTION } from './routing.fixture'

/** O que a API devolve no envelope: os mesmos campos, já serializados. */
const PAYLOAD = JSON.parse(JSON.stringify(READY_SUGGESTION)) as Record<string, unknown> & {
  readonly stops: readonly Record<string, unknown>[]
}

describe('route suggestion response validation (security.md §3)', () => {
  test('accepts the payload the API actually sends', () => {
    expect(toRouteSuggestion(PAYLOAD)).toEqual(READY_SUGGESTION)
  })

  test('refuses anything that is not an object', () => {
    for (const value of [null, undefined, 'suggestion', 42, []]) {
      expect(toRouteSuggestion(value)).toBeNull()
    }
  })

  /** Status fora do catálogo é contrato quebrado; renderizá-lo mostraria a chave crua na tela. */
  test('refuses a status the frontend does not know', () => {
    expect(toRouteSuggestion({ ...PAYLOAD, status: 'almost_ready' })).toBeNull()
  })

  test('refuses a precision the frontend does not know', () => {
    const stops = [{ ...PAYLOAD.stops[0], geocodingPrecision: 'guessed' }]

    expect(toRouteSuggestion({ ...PAYLOAD, stops })).toBeNull()
  })

  /**
   * Uma parada inválida invalida o roteiro inteiro. Meia lista é uma ordem que ninguém propôs — e
   * aceitá-la escreveria em `trip_stops` uma sequência que o solver nunca produziu.
   */
  test('refuses the whole route when a single stop is malformed', () => {
    const stops = [PAYLOAD.stops[0], { addressKey: 'incompleta' }]

    expect(toRouteSuggestion({ ...PAYLOAD, stops })).toBeNull()
  })

  test('refuses a violation without the amount that makes it actionable', () => {
    const stops = [
      {
        ...PAYLOAD.stops[0],
        violations: [{ kind: 'weight', stopIndex: 1, vehicleId: 'vehicle-1' }],
      },
    ]

    expect(toRouteSuggestion({ ...PAYLOAD, stops })).toBeNull()
  })

  /** Sem as premissas não há como dizer de onde veio o ETA — e um ETA sem procedência não vale. */
  test('refuses a suggestion with no assumptions behind it', () => {
    expect(toRouteSuggestion({ ...PAYLOAD, assumptions: {} })).toBeNull()
  })

  /** Parada sem geocodificação ainda é parada: a coordenada ausente não invalida o roteiro. */
  test('accepts a stop that has no coordinate yet', () => {
    const stops = [{ ...PAYLOAD.stops[0], latitude: null, longitude: null }]

    const suggestion = toRouteSuggestion({ ...PAYLOAD, stops })

    expect(suggestion?.stops[0]?.latitude).toBeNull()
  })

  /** Sugestão em fila não tem estimativa ainda, e isso é estado normal — não payload inválido. */
  test('accepts a queued suggestion with no estimates yet', () => {
    const queued = {
      ...PAYLOAD,
      estimatedCostAmount: null,
      estimatedDistanceMeters: null,
      estimatedDurationSeconds: null,
      status: 'queued',
      stops: [],
    }

    expect(toRouteSuggestion(queued)?.status).toBe('queued')
  })
})
