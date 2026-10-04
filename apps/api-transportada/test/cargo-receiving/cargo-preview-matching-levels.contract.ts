/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (T4.3): os três níveis do vínculo — roteiro ↔ carga pelos totais, cliente dentro do
 * grupo, n linhas ↔ 1 nota pela soma exata de valor e peso. Valor é sempre exigido.
 */
import { describe, expect, test } from 'bun:test'

import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import type { ResolveCargoPreviewMatchesParams } from '../../src/cargo-receiving/domain/cargo-preview-matching.types.js'
import { candidate, matchParams, previewItem } from '../fixtures/cargo-preview-matching.fixture.js'

function statesOf(params: ResolveCargoPreviewMatchesParams) {
  return Object.fromEntries(
    resolveCargoPreviewMatches(params).items.map((item) => [
      item.itemKey,
      [item.state, item.documentIds.join(',')],
    ]),
  )
}

describe('nível 1: roteiro ↔ carga (spec 237 RF5a)', () => {
  const items = [
    previewItem('a1', { routeName: 'FR.A', value: '100.00', weightKg: '10.000' }),
    previewItem('a2', { routeName: 'FR.A', value: '200.00', weightKg: '20.000' }),
    previewItem('b1', { routeName: 'FR.B', value: '100.00', weightKg: '10.000' }),
    previewItem('b2', { routeName: 'FR.B', value: '300.00', weightKg: '30.000' }),
  ]
  const candidates = [
    candidate('d1', { grossWeightKg: '10.000', loadReference: '69380', totalValue: '100.00' }),
    candidate('d2', { grossWeightKg: '20.000', loadReference: '69380', totalValue: '200.00' }),
    candidate('d3', { grossWeightKg: '10.000', loadReference: '69381', totalValue: '100.00' }),
    candidate('d4', { grossWeightKg: '30.000', loadReference: '69381', totalValue: '300.00' }),
  ]

  test('o par nasce pelo encaixe dos totais e restringe as notas ao grupo', () => {
    const result = resolveCargoPreviewMatches(matchParams({ candidates, items }))
    expect(result.routePairs).toEqual([
      { loadReference: '69380', routeName: 'FR.A', source: 'totals' },
      { loadReference: '69381', routeName: 'FR.B', source: 'totals' },
    ])
    expect(statesOf(matchParams({ candidates, items }))).toEqual({
      a1: ['matched', 'd1'],
      a2: ['matched', 'd2'],
      b1: ['matched', 'd3'],
      b2: ['matched', 'd4'],
    })
    expect(result.items[0]?.evidence).toEqual(['route_load', 'value', 'weight'])
  })

  test('sem o par, as duas linhas de 100,00 disputariam duas notas e ficariam ambíguas', () => {
    const loose = candidates.map((item) => ({ ...item, loadReference: undefined }))
    const states = statesOf(matchParams({ candidates: loose, items }))
    expect(states['a1']?.[0]).toBe('ambiguous')
    expect(states['b1']).toEqual(['ambiguous', 'd1,d3'])
  })

  test('com o XML parcial, o par nasce pelos votos das linhas que já fecham', () => {
    const partial = candidates.filter((item) => item.id !== 'd2' && item.id !== 'd4')
    const extra = [
      candidate('d5', { grossWeightKg: '20.000', loadReference: '69380', totalValue: '200.00' }),
    ]
    const result = resolveCargoPreviewMatches(
      matchParams({ candidates: [...partial, ...extra], items }),
    )
    expect(
      result.routePairs.map((pair) => [pair.routeName, pair.loadReference, pair.source]),
    ).toEqual([
      ['FR.A', '69380', 'totals'],
      ['FR.B', '69381', 'votes'],
    ])
    expect(statesOf(matchParams({ candidates: [...partial, ...extra], items }))['b2']).toEqual([
      'awaiting_xml',
      '',
    ])
  })

  test('o par já conhecido vale, e a carga dele não é reutilizada por outro roteiro', () => {
    const knownRoutePairs = [{ loadReference: '69381', routeName: 'FR.A' }]
    const result = resolveCargoPreviewMatches(matchParams({ candidates, items, knownRoutePairs }))
    expect(result.routePairs).toEqual([
      { loadReference: '69381', routeName: 'FR.A', source: 'known' },
      { loadReference: '69380', routeName: 'FR.B', source: 'votes' },
    ])
  })

  test('dois roteiros empatados na mesma carga não pareiam', () => {
    const twins = [
      previewItem('a1', { routeName: 'FR.A' }),
      previewItem('b1', { routeName: 'FR.B' }),
    ]
    const result = resolveCargoPreviewMatches(
      matchParams({ candidates: [candidate('d1', { loadReference: '69380' })], items: twins }),
    )
    expect(result.routePairs).toEqual([])
    expect(result.items.map((item) => item.state)).toEqual(['ambiguous', 'ambiguous'])
  })
})

describe('nível 2: o cliente dentro do grupo', () => {
  const items = [
    previewItem('c1', { postalCode: '00000001', recipientCode: '10001' }),
    previewItem('c2', { postalCode: '00000002', recipientCode: '10002' }),
  ]
  const candidates = [
    candidate('d1', { recipientPostalCode: '00000091', recipientTaxId: '99000000000001' }),
    candidate('d2', { recipientPostalCode: '00000092', recipientTaxId: '99000000000002' }),
  ]

  test('sem alias nem CEP, mesmo valor e peso é empate', () => {
    expect(statesOf(matchParams({ candidates, items }))).toEqual({
      c1: ['ambiguous', 'd1,d2'],
      c2: ['ambiguous', 'd1,d2'],
    })
  })

  test('o alias Company → CNPJ separa os dois', () => {
    const knownAliases = [{ recipientCode: '10002', recipientTaxId: '99000000000001' }]
    const result = resolveCargoPreviewMatches(matchParams({ candidates, items, knownAliases }))
    expect(statesOf(matchParams({ candidates, items, knownAliases }))).toEqual({
      c1: ['matched', 'd2'],
      c2: ['matched', 'd1'],
    })
    expect(result.items[1]?.evidence).toContain('recipient_alias')
  })

  test('o CEP igual reforça, e o nome normalizado também', () => {
    const byPostalCode = [
      candidate('d1', { recipientPostalCode: '00000091', recipientTaxId: '99000000000001' }),
      candidate('d2', { recipientPostalCode: '00000001', recipientTaxId: '99000000000002' }),
    ]
    expect(statesOf(matchParams({ candidates: byPostalCode, items }))).toEqual({
      c1: ['matched', 'd2'],
      c2: ['matched', 'd1'],
    })
    const named = [
      previewItem('c1', { recipientCode: '10001', recipientName: 'Mercado  São José Ltda' }),
      previewItem('c2', { recipientCode: '10002' }),
    ]
    const byName = [candidate('d1'), candidate('d2', { recipientName: 'MERCADO SAO JOSE LTDA' })]
    expect(statesOf(matchParams({ candidates: byName, items: named }))['c1']).toEqual([
      'matched',
      'd2',
    ])
  })

  test('CEP da planilha diferente do da nota não impede: valor e peso fecham', () => {
    const result = resolveCargoPreviewMatches(
      matchParams({
        candidates: [candidates[0] ?? candidate('d1')],
        items: [items[0] ?? previewItem('c1')],
      }),
    )
    expect(result.items[0]).toMatchObject({ documentIds: ['d1'], state: 'matched' })
    expect(result.items[0]?.evidence).not.toContain('postal_code')
  })
})

describe('nível 3: n linhas ↔ 1 nota pela soma exata', () => {
  test('dois pedidos do mesmo cliente numa nota (2.664,00 + 1.243,56)', () => {
    const items = [
      previewItem('p1', { recipientCode: '10001', value: '2664.00', weightKg: '319.400' }),
      previewItem('p2', { recipientCode: '10001', value: '1243.56', weightKg: '36.820' }),
    ]
    const result = resolveCargoPreviewMatches(
      matchParams({
        candidates: [candidate('d1', { grossWeightKg: '356.220', totalValue: '3907.56' })],
        items,
      }),
    )
    expect(result.items.map((item) => [item.state, item.documentIds])).toEqual([
      ['matched', ['d1']],
      ['matched', ['d1']],
    ])
    expect(result.items[0]?.evidence).toContain('sum')
  })

  test('três pedidos numa nota, e o mesmo cliente com duas notas para duas linhas', () => {
    const items = [
      previewItem('t1', { recipientCode: '7', value: '10.00', weightKg: '1.000' }),
      previewItem('t2', { recipientCode: '7', value: '20.00', weightKg: '2.000' }),
      previewItem('t3', { recipientCode: '7', value: '30.00', weightKg: '3.000' }),
      previewItem('u1', { recipientCode: '8', value: '11.00', weightKg: '1.100' }),
      previewItem('u2', { recipientCode: '8', value: '12.00', weightKg: '1.200' }),
    ]
    const candidates = [
      candidate('d1', { grossWeightKg: '6.000', totalValue: '60.00' }),
      candidate('d2', { grossWeightKg: '1.100', totalValue: '11.00' }),
      candidate('d3', { grossWeightKg: '1.200', totalValue: '12.00' }),
    ]
    expect(statesOf(matchParams({ candidates, items }))).toEqual({
      t1: ['matched', 'd1'],
      t2: ['matched', 'd1'],
      t3: ['matched', 'd1'],
      u1: ['matched', 'd2'],
      u2: ['matched', 'd3'],
    })
  })

  test('a soma é exata ao centavo: 100,00 + 50,01 não fecha 150,00', () => {
    const items = [
      previewItem('p1', { recipientCode: '1', value: '100.00', weightKg: '10.000' }),
      previewItem('p2', { recipientCode: '1', value: '50.01', weightKg: '5.000' }),
    ]
    const candidates = [candidate('d1', { grossWeightKg: '15.000', totalValue: '150.00' })]
    expect(statesOf(matchParams({ candidates, items }))).toEqual({
      p1: ['awaiting_xml', ''],
      p2: ['awaiting_xml', ''],
    })
  })

  test('duas partições possíveis: o que todas concordam vincula, o resto é ambíguo', () => {
    const items = [
      previewItem('a', { recipientCode: '1', value: '100.00', weightKg: '10.000' }),
      previewItem('b', { recipientCode: '1', value: '50.00', weightKg: '5.000' }),
      previewItem('c', { recipientCode: '1', value: '50.00', weightKg: '5.000' }),
    ]
    const candidates = [
      candidate('d1', { grossWeightKg: '15.000', totalValue: '150.00' }),
      candidate('d2', { grossWeightKg: '5.000', totalValue: '50.00' }),
    ]
    expect(statesOf(matchParams({ candidates, items }))).toEqual({
      a: ['matched', 'd1'],
      b: ['ambiguous', 'd1,d2'],
      c: ['ambiguous', 'd1,d2'],
    })
  })
})
