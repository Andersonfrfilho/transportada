/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 167 T101 (RF9/CA10): a ocorrência vai passar a publicar `corrections[]` (o conjunto de itens
 * que valia antes de cada correção) e `cancellation`. O bundle precisa aceitá-las **antes** de a API
 * mandá-las — o guard tem lista fechada, e chave desconhecida derruba a resposta inteira.
 *
 * É a mesma ordem da spec 166, pela mesma razão medida em 22/09 às 19:03: a tela disse que a foto
 * falhou sobre uma escrita que tinha acontecido.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const CANCELLATION = {
  cancelledAt: '2026-09-22T20:10:00.000Z',
  cancelledByName: 'Operador',
  reason: 'Registrada na nota errada',
} as const

const CORRECTION = {
  correctedAt: '2026-09-22T19:40:00.000Z',
  correctedByName: 'Separador',
  previousItems: [{ code: '183', quantity: '1.000', unit: 'unit' }],
} as const

function buildOccurrence(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    createdAt: '2026-09-22T19:03:10.795Z',
    id: '4b581a02-3dba-4df9-a20b-20ac66163fa1',
    note: '',
    occurrenceTypeId: '54ed0225-f293-47c3-84fe-0b66eff68784',
    productCode: '183',
    productCodes: ['183'],
    stage: 'separation',
    typeName: 'Item avariado',
    ...extra,
  }
}

describe('tolerância a correção e cancelamento na ocorrência (spec 167 CA10)', () => {
  it('aceita a ocorrência de hoje, sem histórico nenhum', () => {
    expect(adapters.occurrencesFromApi([buildOccurrence()])).toHaveLength(1)
  })

  it('aceita a ocorrência corrigida, com o conjunto que valia antes', () => {
    const [occurrence] = adapters.occurrencesFromApi([
      buildOccurrence({ corrections: [CORRECTION] }),
    ])

    expect(occurrence?.corrections).toEqual([CORRECTION])
  })

  it('aceita a ocorrência cancelada, com motivo e autor', () => {
    const [occurrence] = adapters.occurrencesFromApi([
      buildOccurrence({ cancellation: CANCELLATION }),
    ])

    expect(occurrence?.cancellation).toEqual(CANCELLATION)
  })

  /** `null` é "não foi cancelada" e precisa passar — a API manda a chave sempre que a publica. */
  it('aceita `cancellation` nulo', () => {
    const [occurrence] = adapters.occurrencesFromApi([buildOccurrence({ cancellation: null })])

    expect(occurrence?.cancellation).toBeNull()
  })

  /**
   * Tolerar a chave não é aceitar qualquer coisa: cancelamento sem motivo ou correção sem o
   * conjunto anterior chegariam à tela como histórico vazio, que é pior que histórico ausente —
   * parece que ninguém mexeu.
   */
  it('recusa histórico com forma inesperada', () => {
    expect(() =>
      adapters.occurrencesFromApi([
        buildOccurrence({ cancellation: { cancelledAt: '2026-09-22T20:10:00.000Z' } }),
      ]),
    ).toThrow()
    expect(() =>
      adapters.occurrencesFromApi([buildOccurrence({ corrections: [{ correctedAt: 'x' }] })]),
    ).toThrow()
    expect(() => adapters.occurrencesFromApi([buildOccurrence({ corrections: {} })])).toThrow()
  })
})
