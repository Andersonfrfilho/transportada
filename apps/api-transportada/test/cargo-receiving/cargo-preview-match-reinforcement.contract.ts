/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (correção da revisão da Fase 4a, M2 e a pergunta aberta da passada `open`): valor e
 * peso batendo sozinhos são sugestão. Vínculo conferido — e alias `Company → CNPJ` aprendido — só com
 * um reforço independente: par roteiro ↔ carga pelos totais, CEP, razão social ou alias já firmado.
 */
import { describe, expect, test } from 'bun:test'

import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import { candidate, matchParams, previewItem } from '../fixtures/cargo-preview-matching.fixture.js'

const LOAD = '69380'

describe('valor e peso sozinhos não são vínculo conferido (spec 237 RF5a, M2)', () => {
  test('sem par por totais nem CEP, razão social ou alias: sugestão, e nenhum alias aprendido', () => {
    const result = resolveCargoPreviewMatches(
      matchParams({
        candidates: [candidate('d1')],
        items: [previewItem('a', { recipientCode: '1' })],
      }),
    )
    expect(result.items[0]).toMatchObject({ documentIds: ['d1'], state: 'suggested' })
    expect(result.items[0]?.evidence).toEqual(['value', 'weight'])
    expect(result.learnedAliases).toEqual([])
  })

  test('com o CEP igual, o mesmo valor e peso viram vínculo e ensinam o alias', () => {
    const result = resolveCargoPreviewMatches(
      matchParams({
        candidates: [candidate('d1', { recipientPostalCode: '00000001' })],
        items: [previewItem('a', { postalCode: '00000001', recipientCode: '1' })],
      }),
    )
    expect(result.items[0]?.state).toBe('matched')
    expect(result.learnedAliases).toEqual([
      { recipientCode: '1', recipientTaxId: '99000000000001' },
    ])
  })

  test('no par por votos, valor e peso sem reforço seguem sugestão', () => {
    const route = Array.from({ length: 4 }, (_unused, index) =>
      previewItem(`l${index}`, { recipientCode: `4${index}`, value: `${100 + index}.00` }),
    )
    const documents = route.map((_item, index) =>
      candidate(`d${index}`, { loadReference: LOAD, totalValue: `${100 + index}.00` }),
    )
    const partial = documents.slice(0, 3)
    const result = resolveCargoPreviewMatches(matchParams({ candidates: partial, items: route }))
    expect(result.routePairs[0]?.source).toBe('votes')
    expect(result.items.slice(0, 3).map((item) => item.state)).toEqual([
      'suggested',
      'suggested',
      'suggested',
    ])
    const complete = resolveCargoPreviewMatches(
      matchParams({ candidates: documents, items: route }),
    )
    expect(complete.routePairs[0]?.source).toBe('totals')
    expect(complete.items.every((item) => item.state === 'matched')).toBe(true)
  })
})
