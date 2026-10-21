/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 277 RF5: a resolução média por tipo no painel. A média vem pronta da API; o painel lê com
 * tolerância, formata e calcula só o "resolveu em" de cada linha resolvida (a mesma definição da média).
 */
import { describe, expect, test } from 'bun:test'

import {
  formatResolutionDuration,
  readTripOccurrenceResolutionSummary,
  resolveOccurrenceResolvedInSeconds,
  splitResolutionDuration,
} from '../../src/modules/trip/shared/tripOccurrenceResolutionSummary.service'

const LABELS = { lessThanMinute: 'menos de 1 min' } as const

describe('leitura da resolução média por tipo (spec 277 RF5)', () => {
  test('lê as linhas válidas e descarta a malformada sem derrubar a lista', () => {
    expect(
      readTripOccurrenceResolutionSummary({
        data: [
          { averageSeconds: 7500, resolvedCount: 2, typeName: 'Cliente ausente' },
          { averageSeconds: -1, resolvedCount: 1, typeName: 'Negativa' },
          { averageSeconds: 60, resolvedCount: 0, typeName: 'Sem resolvidas' },
          { averageSeconds: '60', resolvedCount: 1, typeName: 'Texto' },
          { averageSeconds: 60, resolvedCount: 1, typeName: '' },
          null,
        ],
      }),
    ).toEqual([{ averageSeconds: 7500, resolvedCount: 2, typeName: 'Cliente ausente' }])
  })

  test('corpo que não é o esperado vira lista vazia, que esconde o painel', () => {
    expect(readTripOccurrenceResolutionSummary(null)).toEqual([])
    expect(readTripOccurrenceResolutionSummary({ data: 'x' })).toEqual([])
    expect(readTripOccurrenceResolutionSummary({})).toEqual([])
  })
})

describe('formatação da duração (spec 277 RF5)', () => {
  test('horas e minutos com minutos de dois dígitos; menos de uma hora é só minutos', () => {
    expect(formatResolutionDuration(2 * 3600 + 5 * 60, LABELS)).toBe('2 h 05 min')
    expect(formatResolutionDuration(45 * 60, LABELS)).toBe('45 min')
    expect(formatResolutionDuration(3600, LABELS)).toBe('1 h 00 min')
    expect(splitResolutionDuration(90 * 60)).toEqual({ hours: 1, minutes: 30 })
  })

  test('abaixo de meio minuto é "menos de 1 min", nunca "0 min"', () => {
    expect(formatResolutionDuration(0, LABELS)).toBe('menos de 1 min')
    expect(formatResolutionDuration(29, LABELS)).toBe('menos de 1 min')
    expect(formatResolutionDuration(30, LABELS)).toBe('1 min')
  })
})

describe('"Resolveu em" por linha (spec 277 RF5)', () => {
  const registered = '2026-09-22T12:00:00.000Z'

  test('resolvida: do registro até o momento da resolução', () => {
    expect(
      resolveOccurrenceResolvedInSeconds({
        createdAt: registered,
        resolution: { actorKind: 'internal', at: '2026-09-22T14:05:00.000Z', state: 'resolved' },
      }),
    ).toBe(2 * 3600 + 5 * 60)
  })

  test('reaberta, em aberto e cancelada não têm "resolveu em"', () => {
    for (const state of ['reopened', 'cancelled'] as const) {
      expect(
        resolveOccurrenceResolvedInSeconds({
          createdAt: registered,
          resolution: { actorKind: 'internal', at: '2026-09-22T14:05:00.000Z', state },
        }),
      ).toBeNull()
    }
    expect(
      resolveOccurrenceResolvedInSeconds({ createdAt: registered, resolution: null }),
    ).toBeNull()
    expect(resolveOccurrenceResolvedInSeconds({ createdAt: registered })).toBeNull()
  })

  test('data ilegível ou resolução antes do registro não vira número negativo nem NaN', () => {
    expect(
      resolveOccurrenceResolvedInSeconds({
        createdAt: 'ontem',
        resolution: { actorKind: null, at: registered, state: 'resolved' },
      }),
    ).toBeNull()
    expect(
      resolveOccurrenceResolvedInSeconds({
        createdAt: registered,
        resolution: { actorKind: null, at: '2026-09-22T11:00:00.000Z', state: 'resolved' },
      }),
    ).toBe(0)
  })
})
