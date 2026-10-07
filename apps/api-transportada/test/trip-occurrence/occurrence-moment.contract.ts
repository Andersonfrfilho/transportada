/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1b.1b: a regra pura do conjunto de momentos. A derivação a partir de `stage`/`flow` é a
 * gêmea do backfill (o que a leitura tolerante usa para tipo sem linha), e a derivação inversa é o
 * que grava `stage`/`flow` quando o tipo tem vários momentos — `stage = 'separation'` se e só se o
 * galpão está no conjunto (CHECK de `leaves_document_behind`), `flow = 'stop'` se e só se há parada
 * e não há nota.
 */
import { describe, expect, test } from 'bun:test'

import {
  assertOccurrenceMomentsAreWritable,
  deriveOccurrenceMomentsFromStageAndFlow,
  deriveStageAndFlowFromMoments,
  normalizeOccurrenceMoments,
  occurrenceTypeAcceptsMoment,
  resolveOccurrenceTypeMoments,
} from '../../src/trips/domain/occurrence-moment.policy.js'

describe('momentos derivados de stage/flow — a gêmea do backfill (spec 246 T1b.1b)', () => {
  const cases = [
    ['separation', 'document', ['separation']],
    ['separation', 'stop', ['separation', 'stop']],
    ['delivery', 'document', ['document', 'office']],
    ['delivery', 'stop', ['stop', 'office']],
  ] as const

  for (const [stage, flow, moments] of cases) {
    test(`${stage} + ${flow} → ${moments.join(' + ')}`, () => {
      expect(deriveOccurrenceMomentsFromStageAndFlow({ flow, stage })).toEqual([...moments])
    })
  }

  test('flow ausente é nota, como todo leitor de hoje', () => {
    expect(deriveOccurrenceMomentsFromStageAndFlow({ stage: 'delivery' })).toEqual([
      'document',
      'office',
    ])
  })
})

describe('tipo de recebimento não tem momento de rua (spec 246, terceira revisão A-1; spec 237)', () => {
  test('nenhum par stage receiving deriva momento, com flow de nota ou de parada', () => {
    expect(
      deriveOccurrenceMomentsFromStageAndFlow({ flow: 'document', stage: 'receiving' }),
    ).toEqual([])
    expect(deriveOccurrenceMomentsFromStageAndFlow({ flow: 'stop', stage: 'receiving' })).toEqual(
      [],
    )
    expect(deriveOccurrenceMomentsFromStageAndFlow({ stage: 'receiving' })).toEqual([])
  })

  test('sem linha de momento a leitura tolerante continua vazia, e nenhuma guarda o aceita', () => {
    const type = { flow: 'document', moments: [], stage: 'receiving' } as const
    expect(resolveOccurrenceTypeMoments(type)).toEqual([])
    for (const moment of ['separation', 'document', 'stop', 'office'] as const) {
      expect(occurrenceTypeAcceptsMoment({ moment, type })).toBe(false)
    }
  })
})

describe('leitura tolerante na janela de deploy (spec 246 T1b.1b)', () => {
  test('tipo com linha de momento usa o gravado', () => {
    expect(
      resolveOccurrenceTypeMoments({
        flow: 'document',
        moments: ['separation', 'document'],
        stage: 'separation',
      }),
    ).toEqual(['separation', 'document'])
  })

  test('tipo sem linha (lista vazia ou ausente) cai nos derivados de stage/flow', () => {
    expect(resolveOccurrenceTypeMoments({ flow: 'stop', moments: [], stage: 'delivery' })).toEqual([
      'stop',
      'office',
    ])
    expect(resolveOccurrenceTypeMoments({ stage: 'separation' })).toEqual(['separation'])
  })
})

describe('stage/flow derivados do conjunto (spec 246 T1b.1b)', () => {
  test('separation no conjunto é stage separation, e a nota mantém flow document', () => {
    expect(deriveStageAndFlowFromMoments(['separation', 'document'])).toEqual({
      flow: 'document',
      stage: 'separation',
    })
  })

  test('sem galpão é stage delivery; parada sem nota é flow stop', () => {
    expect(deriveStageAndFlowFromMoments(['stop', 'office'])).toEqual({
      flow: 'stop',
      stage: 'delivery',
    })
    expect(deriveStageAndFlowFromMoments(['office'])).toEqual({
      flow: 'document',
      stage: 'delivery',
    })
  })

  test('normaliza para a ordem canônica, sem repetição', () => {
    expect(normalizeOccurrenceMoments(['office', 'document', 'office'])).toEqual([
      'document',
      'office',
    ])
  })
})

describe('o conjunto gravável (spec 246 T1b.1b)', () => {
  test('nota e parada juntas são recusadas até o app deduplicar por id + momento', () => {
    expect(() => assertOccurrenceMomentsAreWritable(['document', 'stop'])).toThrow(
      expect.objectContaining({ code: 'OCCURRENCE_TYPE_MOMENTS_DOCUMENT_AND_STOP', status: 422 }),
    )
  })

  test('conjunto vazio é recusado: o tipo não apareceria para ninguém (T1b.6)', () => {
    expect(() => assertOccurrenceMomentsAreWritable([])).toThrow(
      expect.objectContaining({ code: 'OCCURRENCE_TYPE_MOMENTS_REQUIRED', status: 422 }),
    )
  })

  test('galpão e nota juntos são aceitos', () => {
    expect(() => assertOccurrenceMomentsAreWritable(['separation', 'document'])).not.toThrow()
  })
})
