/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (correção da revisão da Fase 4a, M5/M6): o arredondamento do peso cresce com o
 * número de linhas somadas, e uma linha só é vínculo quando o bloco inteiro dela é o mesmo em toda
 * partição ótima — linhas idênticas do mesmo cliente são intercambiáveis e vão pela ordem.
 */
import { describe, expect, test } from 'bun:test'

import {
  PREVIEW_WEIGHT_ROUNDING_FLOOR_KG,
  PREVIEW_WEIGHT_ROUNDING_PER_LINE_KG,
} from '../../src/cargo-receiving/domain/cargo-preview-matching.constant.js'
import { createWeightCloses } from '../../src/cargo-receiving/domain/cargo-preview-match-input.policy.js'
import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import { candidate, matchParams, previewItem } from '../fixtures/cargo-preview-matching.fixture.js'

const POSTAL_CODE = '00000001'

function line(itemKey: string, value: string, weightKg: string) {
  return previewItem(itemKey, { postalCode: POSTAL_CODE, recipientCode: '1', value, weightKg })
}

function note(id: string, totalValue: string, grossWeightKg: string) {
  return candidate(id, { grossWeightKg, recipientPostalCode: POSTAL_CODE, totalValue })
}

function statesOf(result: ReturnType<typeof resolveCargoPreviewMatches>) {
  return Object.fromEntries(
    result.items.map((item) => [item.itemKey, `${item.state}:${item.documentIds.join(',')}`]),
  )
}

describe('o piso de peso escala com as linhas somadas (spec 237 RF5a, M5)', () => {
  test('piso de 0,01 kg para uma linha e 0,005 kg por linha somada', () => {
    expect([PREVIEW_WEIGHT_ROUNDING_FLOOR_KG, PREVIEW_WEIGHT_ROUNDING_PER_LINE_KG]).toEqual([
      0.01, 0.005,
    ])
    const closes = createWeightCloses(0)
    expect(closes({ documentGrams: 3_015n, lineCount: 3, lineGrams: 3_030n })).toBe(true)
    expect(closes({ documentGrams: 3_015n, lineCount: 3, lineGrams: 3_031n })).toBe(false)
    expect(closes({ documentGrams: 1_000n, lineCount: 1, lineGrams: 1_010n })).toBe(true)
    expect(closes({ documentGrams: 1_000n, lineCount: 1, lineGrams: 1_011n })).toBe(false)
    expect(closes({ documentGrams: 2_000n, lineCount: 2, lineGrams: 2_010n })).toBe(true)
  })

  test('3 linhas de 1,01 kg fecham a nota de 3,015 kg', () => {
    const result = resolveCargoPreviewMatches(
      matchParams({
        candidates: [note('d1', '30.00', '3.015')],
        items: [line('x', '10.00', '1.01'), line('y', '10.00', '1.01'), line('z', '10.00', '1.01')],
      }),
    )
    expect(statesOf(result)).toEqual({ x: 'matched:d1', y: 'matched:d1', z: 'matched:d1' })
  })

  test('os totais de um roteiro com 30 linhas fecham com 5 g de arredondamento por linha', () => {
    const items = Array.from({ length: 30 }, (_unused, index) =>
      previewItem(`l${index}`, {
        recipientCode: String(10_000 + index),
        value: `${100 + index}.00`,
        weightKg: '1.01',
      }),
    )
    const documents = items.map((_item, index) =>
      candidate(`d${String(index).padStart(2, '0')}`, {
        grossWeightKg: '1.005',
        loadReference: '69380',
        totalValue: `${100 + index}.00`,
      }),
    )
    const result = resolveCargoPreviewMatches(matchParams({ candidates: documents, items }))
    expect(result.routePairs).toEqual([
      { loadReference: '69380', routeName: 'FR.S.CAR', source: 'totals' },
    ])
    expect(result.items.every((item) => item.state === 'matched')).toBe(true)
  })
})

describe('a linha só vincula com o bloco inteiro (spec 237 RF5a, M6)', () => {
  test('a=300/30 e b=c=100/10 contra D=400/40 e E=100/10: a e b em D, c em E', () => {
    const result = resolveCargoPreviewMatches(
      matchParams({
        candidates: [note('d1', '400.00', '40.000'), note('d2', '100.00', '10.000')],
        items: [
          line('a', '300.00', '30.000'),
          line('b', '100.00', '10.000'),
          line('c', '100.00', '10.000'),
        ],
      }),
    )
    expect(statesOf(result)).toEqual({ a: 'matched:d1', b: 'matched:d1', c: 'matched:d2' })
    expect(result.items[0]?.evidence).toContain('sum')
  })

  test('linhas diferentes que trocam de bloco: a mesma nota não basta, a linha é ambígua', () => {
    const result = resolveCargoPreviewMatches(
      matchParams({
        candidates: [note('d1', '150.00', '15.000'), note('d2', '50.00', '5.000')],
        items: [
          line('a', '100.00', '10.000'),
          line('b', '50.00', '5.000'),
          line('c', '50.00', '5.004'),
        ],
      }),
    )
    expect(statesOf(result)).toEqual({
      a: 'ambiguous:d1',
      b: 'ambiguous:d1,d2',
      c: 'ambiguous:d1,d2',
    })
  })
})
