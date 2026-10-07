/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (T4.3): as regras que valem em todo nível — valor sempre exigido, 1:1 por nota,
 * empate é ambíguo, só valor é sugestão, teto da partição, ordem estável, alias aprendido — e o
 * `NroCarga` lido do `infCpl` pelo padrão do perfil, sem nunca lançar.
 */
import { describe, expect, test } from 'bun:test'

import {
  MAX_PARTITION_LINES,
  MAX_PARTITION_SEARCH_NODES,
  PREVIEW_WEIGHT_ROUNDING_FLOOR_KG,
} from '../../src/cargo-receiving/domain/cargo-preview-matching.constant.js'
import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import {
  indexByValue,
  toMatchDocument,
  toMatchLine,
} from '../../src/cargo-receiving/domain/cargo-preview-match-input.policy.js'
import {
  buildPartitionOptions,
  searchPartitions,
} from '../../src/cargo-receiving/domain/cargo-preview-partition.policy.js'
import { extractLoadReference } from '../../src/cargo-receiving/domain/load-reference.policy.js'
import { candidate, matchParams, previewItem } from '../fixtures/cargo-preview-matching.fixture.js'

/** O CEP igual é o reforço que faz valor e peso valerem fora de um par por totais (M2). */
const CEP = { postalCode: '00000001' } as const
const NOTE_CEP = { recipientPostalCode: '00000001' } as const

describe('as regras do vínculo (spec 237 RF5a)', () => {
  test('valor é sempre exigido: peso, CEP e alias iguais não bastam', () => {
    const items = [
      previewItem('a', { postalCode: '00000001', recipientCode: '1', value: '100.00' }),
    ]
    const candidates = [
      candidate('d1', {
        recipientPostalCode: '00000001',
        recipientTaxId: '99000000000001',
        totalValue: '100.01',
      }),
    ]
    const knownAliases = [{ recipientCode: '1', recipientTaxId: '99000000000001' }]
    const [item] = resolveCargoPreviewMatches(
      matchParams({ candidates, items, knownAliases }),
    ).items
    expect(item).toEqual({ documentIds: [], evidence: [], itemKey: 'a', state: 'awaiting_xml' })
  })

  test('só o valor fecha (peso diferente): sugestão, que o operador confirma', () => {
    const [item] = resolveCargoPreviewMatches(
      matchParams({
        candidates: [candidate('d1', { grossWeightKg: '10.011' })],
        items: [previewItem('a')],
      }),
    ).items
    expect(item).toEqual({
      documentIds: ['d1'],
      evidence: ['value'],
      itemKey: 'a',
      state: 'suggested',
    })
  })

  test('a tolerância de peso do perfil vale para o fechamento', () => {
    const params = matchParams({
      candidates: [candidate('d1', { ...NOTE_CEP, grossWeightKg: '10.050' })],
      items: [previewItem('a', CEP)],
      weightTolerancePercent: 1,
    })
    expect(resolveCargoPreviewMatches(params).items[0]?.state).toBe('matched')
  })

  test.each([
    [
      'Δ 0,005 kg com tolerância 0: o piso de arredondamento casa',
      '10.005',
      '10.000',
      0,
      'matched',
    ],
    ['Δ 0,010 kg com tolerância 0: no limite do piso', '10.010', '10.000', 0, 'matched'],
    ['Δ 0,011 kg com tolerância 0: passa do piso, só valor', '10.011', '10.000', 0, 'suggested'],
    [
      'Δ 0,05 kg em 100 kg com 0,05%: o percentual vale acima do piso',
      '100.050',
      '100.000',
      0.05,
      'matched',
    ],
    [
      'Δ 0,005 kg em 2 kg com 0,05%: o piso vale também com percentual',
      '2.005',
      '2.000',
      0.05,
      'matched',
    ],
    ['Δ 0,06 kg em 100 kg com 0,05%: passa dos dois', '100.060', '100.000', 0.05, 'suggested'],
  ])('%s', (_label, documentWeight, lineWeight, weightTolerancePercent, state) => {
    const params = matchParams({
      candidates: [candidate('d1', { ...NOTE_CEP, grossWeightKg: documentWeight })],
      items: [previewItem('a', { ...CEP, weightKg: lineWeight })],
      weightTolerancePercent,
    })
    expect(String(resolveCargoPreviewMatches(params).items[0]?.state)).toBe(state)
  })

  test('o piso é de 0,01 kg', () => {
    expect(PREVIEW_WEIGHT_ROUNDING_FLOOR_KG).toBe(0.01)
  })

  test('nota sem peso no XML só sugere', () => {
    const params = matchParams({
      candidates: [candidate('d1', { grossWeightKg: undefined })],
      items: [previewItem('a')],
    })
    expect(resolveCargoPreviewMatches(params).items[0]?.state).toBe('suggested')
  })

  test('sem candidata, a linha espera o XML', () => {
    expect(resolveCargoPreviewMatches(matchParams({ items: [previewItem('a')] })).items).toEqual([
      { documentIds: [], evidence: [], itemKey: 'a', state: 'awaiting_xml' },
    ])
  })

  test('duas notas iguais para uma linha: ambíguo, com as duas para o operador', () => {
    const params = matchParams({
      candidates: [candidate('d2'), candidate('d1')],
      items: [previewItem('a')],
    })
    expect(resolveCargoPreviewMatches(params).items[0]).toMatchObject({
      documentIds: ['d1', 'd2'],
      state: 'ambiguous',
    })
  })

  test('1:1: duas linhas de clientes diferentes não levam a mesma nota', () => {
    const items = [
      previewItem('a', { recipientCode: '1' }),
      previewItem('b', { recipientCode: '2' }),
    ]
    const result = resolveCargoPreviewMatches(matchParams({ candidates: [candidate('d1')], items }))
    expect(result.items.map((item) => [item.state, item.documentIds])).toEqual([
      ['ambiguous', ['d1']],
      ['ambiguous', ['d1']],
    ])
  })

  test('uma nota não entra em dois grupos de linhas (soma de um cliente × linha de outro)', () => {
    const items = [
      previewItem('a1', { recipientCode: '1', value: '60.00', weightKg: '6.000' }),
      previewItem('a2', { recipientCode: '1', value: '40.00', weightKg: '4.000' }),
      previewItem('b1', { recipientCode: '2', value: '100.00', weightKg: '10.000' }),
    ]
    const result = resolveCargoPreviewMatches(matchParams({ candidates: [candidate('d1')], items }))
    expect(result.items.map((item) => item.state)).toEqual(['ambiguous', 'ambiguous', 'ambiguous'])
    expect(result.items.filter((item) => item.state === 'matched')).toEqual([])
  })

  test(`acima de ${MAX_PARTITION_LINES} linhas do mesmo cliente não há partição: 1:1 ou ambíguo, sem travar`, () => {
    const items = Array.from({ length: MAX_PARTITION_LINES + 1 }, (_unused, index) =>
      previewItem(`l${index}`, {
        postalCode: '00000001',
        recipientCode: '1',
        value: `${index + 1}0.00`,
        weightKg: `${index + 1}.000`,
      }),
    )
    const candidates = [
      candidate('d1', { ...NOTE_CEP, grossWeightKg: '1.000', totalValue: '10.00' }),
      candidate('d2', {
        grossWeightKg: '5.000',
        recipientPostalCode: '00000001',
        totalValue: '50.00',
      }),
    ]
    const startedAt = performance.now()
    const result = resolveCargoPreviewMatches(matchParams({ candidates, items }))
    expect(performance.now() - startedAt).toBeLessThan(500)
    expect(result.items[0]).toMatchObject({ documentIds: ['d1'], state: 'matched' })
    expect(result.items[4]).toMatchObject({ documentIds: ['d2'], state: 'matched' })
    expect(result.items[1]).toMatchObject({ documentIds: [], state: 'awaiting_xml' })
  })

  test('a busca da partição tem teto de nós: estourou, é ambíguo — nunca trava', () => {
    expect([MAX_PARTITION_LINES, MAX_PARTITION_SEARCH_NODES]).toEqual([6, 5_000])
    const lines = Array.from({ length: 6 }, (_unused, index) => previewItem(`l${index}`)).flatMap(
      (item, index) => toMatchLine(item, index) ?? [],
    )
    const documents = ['d1', 'd2'].flatMap((id) => toMatchDocument(candidate(id)) ?? [])
    const options = buildPartitionOptions({
      allowsDocument: () => true,
      byValue: indexByValue(documents),
      lines,
      requireWeight: true,
      weightCloses: ({ documentGrams, lineGrams }) => lineGrams === documentGrams,
    })
    const complete = searchPartitions({ options })
    expect(complete.kind === 'solutions' ? complete.solutions.length : 0).toBe(30)
    expect(searchPartitions({ maxNodes: 20, options }).kind).toBe('overflow')
  })

  test('ordem estável: embaralhar linhas e notas não muda nada', () => {
    const items = [
      previewItem('a', { recipientCode: '1' }),
      previewItem('b', { recipientCode: '2', value: '20.00', weightKg: '2.000' }),
      previewItem('c', { recipientCode: '3', value: '30.00', weightKg: '3.000' }),
    ]
    const candidates = [
      candidate('d3'),
      candidate('d1'),
      candidate('d2', { grossWeightKg: '2.000', totalValue: '20.00' }),
    ]
    const forward = resolveCargoPreviewMatches(matchParams({ candidates, items }))
    const reversed = resolveCargoPreviewMatches(
      matchParams({ candidates: [...candidates].reverse(), items: [...items].reverse() }),
    )
    expect([...reversed.items].reverse()).toEqual([...forward.items])
    expect(forward.items[0]?.documentIds).toEqual(['d1', 'd3'])
  })

  test('o alias aprendido sai só do vínculo conferido, nunca repete o conhecido nem o conflito', () => {
    const items = [
      previewItem('a', { ...CEP, recipientCode: '1' }),
      previewItem('b', { ...CEP, recipientCode: '2', value: '20.00', weightKg: '2.000' }),
      previewItem('c', { recipientCode: '3', value: '30.00', weightKg: '3.000' }),
      previewItem('s', { recipientCode: '4', value: '40.00', weightKg: '4.000' }),
      previewItem('e1', { ...CEP, recipientCode: '5', value: '50.00', weightKg: '5.000' }),
      previewItem('e2', { ...CEP, recipientCode: '5', value: '60.00', weightKg: '6.000' }),
    ]
    const candidates = [
      candidate('d1', { ...NOTE_CEP, recipientTaxId: '99000000000011' }),
      candidate('d2', {
        ...NOTE_CEP,
        grossWeightKg: '2.000',
        recipientTaxId: '99000000000022',
        totalValue: '20.00',
      }),
      candidate('d3', {
        grossWeightKg: '3.000',
        recipientTaxId: '99000000000033',
        totalValue: '30.00',
      }),
      candidate('d4', {
        grossWeightKg: '9.000',
        recipientTaxId: '99000000000044',
        totalValue: '40.00',
      }),
      candidate('d5', {
        ...NOTE_CEP,
        grossWeightKg: '5.000',
        recipientTaxId: '99000000000055',
        totalValue: '50.00',
      }),
      candidate('d6', {
        ...NOTE_CEP,
        grossWeightKg: '6.000',
        recipientTaxId: '99000000000066',
        totalValue: '60.00',
      }),
    ]
    const knownAliases = [{ recipientCode: '3', recipientTaxId: '99000000000033' }]
    const result = resolveCargoPreviewMatches(matchParams({ candidates, items, knownAliases }))
    expect(result.items.map((item) => item.state)).toEqual([
      'matched',
      'matched',
      'matched',
      'suggested',
      'matched',
      'matched',
    ])
    expect(result.learnedAliases).toEqual([
      { recipientCode: '1', recipientTaxId: '99000000000011' },
      { recipientCode: '2', recipientTaxId: '99000000000022' },
    ])
  })
})

describe('o NroCarga lido do infCpl (spec 237 RF5a, ADR-0094 §2, segurança S3)', () => {
  const LABEL = 'NroCarga:'

  /** O formato real do `infCpl` (anonimizado): o número no meio, ou no fim do texto. */
  test.each([
    ['LACRE: 1020275  - NroCarga: 69380 B.Calc.ST: 123.45', '69380'],
    ['123456 / 1020275  - NroCarga: 69381', '69381'],
    ['NroCarga:69382 LACRE: 1', '69382'],
    ['nrocarga: 69383', '69383'],
    ['NroCarga:      69384', undefined],
    ['NroCarga: - 69385', undefined],
    ['sem carga', undefined],
    [undefined, undefined],
  ])('%p → %p', (additionalInfo, expected) => {
    expect(extractLoadReference({ additionalInfo, label: LABEL })).toBe(expected)
  })

  test('a referência tem até 30 letras ou dígitos', () => {
    const additionalInfo = `NroCarga: ${'A1'.repeat(20)}`
    expect(extractLoadReference({ additionalInfo, label: LABEL })).toBe('A1'.repeat(15))
  })

  test('só os primeiros 2 000 caracteres são lidos', () => {
    const additionalInfo = `${'x'.repeat(2_000)} NroCarga: 69380`
    expect(extractLoadReference({ additionalInfo, label: LABEL })).toBeUndefined()
  })

  test('o texto do perfil é literal, nunca expressão', () => {
    expect(extractLoadReference({ additionalInfo: 'Carga (n.): 7', label: 'Carga (n.):' })).toBe(
      '7',
    )
    expect(extractLoadReference({ additionalInfo: 'NroCargaX: 7', label: 'NroCarga.:' })).toBe(
      undefined,
    )
  })

  /** Os ataques do revisor: antes 2,7 s e 23,6 s; agora o texto é literal e a leitura, linear. */
  test.each([
    ['NroCarga:(\\d*)\\d*\\d*\\d*\\d*X', `NroCarga:${'1'.repeat(200)}`],
    ['(\\d+)\\s*\\d*\\s*\\d*\\s*\\d*\\s*\\d*\\s*\\d*Z', '1'.repeat(1_990)],
    ['a', 'a'.repeat(2_000)],
  ])('texto hostil %p não retrocede', (label, additionalInfo) => {
    const startedAt = performance.now()
    for (let index = 0; index < 100; index += 1) extractLoadReference({ additionalInfo, label })
    expect(performance.now() - startedAt).toBeLessThan(1_000)
  })

  test('sem texto no perfil, ou texto inválido gravado antes, não há carga', () => {
    expect(extractLoadReference({ additionalInfo: 'NroCarga: 1', label: null })).toBeUndefined()
    expect(
      extractLoadReference({ additionalInfo: 'Nro\nCarga: 1', label: 'Nro\nCarga:' }),
    ).toBeUndefined()
  })
})
