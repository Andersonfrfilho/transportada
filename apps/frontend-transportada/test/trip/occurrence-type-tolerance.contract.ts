/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Achado B7 da revisão (mesma família da quebra de 22/09): `allowsMultipleItems` e
 * `redeliveryPolicy` nasceram depois do tipo de ocorrência, e o guard exigia os dois via chave
 * exata. API anterior ao marcador que os introduziu não os manda — e derrubava o catálogo de
 * tipos (Frota/config) e a consulta de tipos que alimenta o diálogo de registro de ocorrência.
 * Ausente tem de degradar para o padrão de hoje: `allowsMultipleItems: true`,
 * `redeliveryPolicy: 'unset'` — nunca reprovar a resposta inteira.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

function buildOccurrenceType(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    active: true,
    allowsMultipleItems: false,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: '54ed0225-f293-47c3-84fe-0b66eff68784',
    name: 'Item avariado',
    notifies: true,
    redeliveryPolicy: 'allowed',
    stage: 'separation',
    ...extra,
  }
}

describe('tolerância a allowsMultipleItems/redeliveryPolicy ausentes (achado B7)', () => {
  it('aceita o tipo de hoje, com os dois campos presentes', () => {
    const [type] = adapters.occurrenceTypesFromApi([buildOccurrenceType()])

    expect(type?.allowsMultipleItems).toBe(false)
    expect(type?.redeliveryPolicy).toBe('allowed')
  })

  it('degrada allowsMultipleItems ausente para o padrão true', () => {
    const raw = buildOccurrenceType()
    delete (raw as Record<string, unknown>).allowsMultipleItems

    const [type] = adapters.occurrenceTypesFromApi([raw])

    expect(type?.allowsMultipleItems).toBe(true)
  })

  it('degrada redeliveryPolicy ausente para o padrão unset', () => {
    const raw = buildOccurrenceType()
    delete (raw as Record<string, unknown>).redeliveryPolicy

    const [type] = adapters.occurrenceTypesFromApi([raw])

    expect(type?.redeliveryPolicy).toBe('unset')
  })

  it('degrada os dois campos ausentes na mesma resposta, e mantém `occurrenceTypeFromApi`', () => {
    const raw = buildOccurrenceType()
    delete (raw as Record<string, unknown>).allowsMultipleItems
    delete (raw as Record<string, unknown>).redeliveryPolicy

    const type = adapters.occurrenceTypeFromApi(raw)

    expect(type.allowsMultipleItems).toBe(true)
    expect(type.redeliveryPolicy).toBe('unset')
  })

  /** Tolerar a ausência não é aceitar qualquer coisa: presente com forma errada continua reprovando. */
  it('recusa allowsMultipleItems/redeliveryPolicy presentes com forma errada', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ allowsMultipleItems: 'yes' })]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ redeliveryPolicy: 'sometimes' })]),
    ).toThrow()
  })

  it('recusa chave desconhecida — a guarda continua de chave exata para o resto', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ unknownField: 'x' })]),
    ).toThrow()
  })

  /** A API manda `emailsContractor` e `stopKind` em todo tipo: reprovar por eles esvazia o catálogo inteiro. */
  it('aceita `emailsContractor` e `stopKind` da API atual', () => {
    const [type] = adapters.occurrenceTypesFromApi([
      buildOccurrenceType({ emailsContractor: false, stopKind: null }),
    ])

    expect(type?.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
  })

  /**
   * Spec 246 T1b.1b (ADR-0081 §9, painel antes da API): o catálogo passa a mandar `moments`. A guarda
   * de chave exata reprovaria a lista inteira; ausente é API anterior ao campo.
   */
  it('aceita `moments` da API nova, e a lista sem ele da API anterior', () => {
    const [withMoments] = adapters.occurrenceTypesFromApi([
      buildOccurrenceType({ moments: ['separation', 'document'] }),
    ])
    const [withoutMoments] = adapters.occurrenceTypesFromApi([buildOccurrenceType()])

    expect(withMoments?.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
    expect(withoutMoments?.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
    expect(adapters.occurrenceTypeFromApi(buildOccurrenceType({ moments: ['office'] })).id).toBe(
      '54ed0225-f293-47c3-84fe-0b66eff68784',
    )
  })

  it('recusa `moments` com forma errada ou momento fora do vocabulário', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ moments: 'separation' })]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ moments: ['warehouse'] })]),
    ).toThrow()
  })

  /**
   * Spec 246 T1c.4 (ADR-0081 §9, painel antes da API): o catálogo passa a mandar a quantidade mínima
   * de fotos e de produtos. Ausente é API anterior; `null` em produtos é "todos os itens da nota".
   */
  it('aceita `photoMinimumCount` e `itemsMinimumCount` da API nova, presentes ou ausentes', () => {
    const [withBoth] = adapters.occurrenceTypesFromApi([
      buildOccurrenceType({ itemsMinimumCount: 2, itemsMode: 'required', photoMinimumCount: 3 }),
    ])
    const [allItems] = adapters.occurrenceTypesFromApi([
      buildOccurrenceType({ itemsMinimumCount: null, itemsMode: 'required', photoMinimumCount: 1 }),
    ])
    const [legacy] = adapters.occurrenceTypesFromApi([buildOccurrenceType()])

    expect(withBoth?.itemsMode).toBe('required')
    expect(allItems?.itemsMode).toBe('required')
    expect(legacy?.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
  })

  it('recusa `photoMinimumCount` e `itemsMinimumCount` com forma ou faixa errada', () => {
    for (const extra of [
      { photoMinimumCount: 0 },
      { photoMinimumCount: 6 },
      { photoMinimumCount: '2' },
      { photoMinimumCount: null },
      { itemsMinimumCount: 0 },
      { itemsMinimumCount: 'all' },
    ]) {
      expect(() => adapters.occurrenceTypesFromApi([buildOccurrenceType(extra)])).toThrow()
    }
  })

  it('recusa `emailsContractor` e `stopKind` com forma errada', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ emailsContractor: 'yes' })]),
    ).toThrow()
    expect(() => adapters.occurrenceTypesFromApi([buildOccurrenceType({ stopKind: 7 })])).toThrow()
  })
})
