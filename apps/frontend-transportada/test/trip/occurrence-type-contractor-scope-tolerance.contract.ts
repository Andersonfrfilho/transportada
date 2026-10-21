/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T1.1 (ADR-0081 §9, painel antes da API): o tipo de ocorrência passa a trazer
 * `contractorScope` e `contractors`. O painel tolera as chaves antes da API publicá-las; valor
 * desconhecido do escopo é aceito como texto e a tela o trata como `all`.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

function buildOccurrenceType(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    active: true,
    allowsMultipleItems: false,
    emailTemplateKey: null,
    id: '54ed0225-f293-47c3-84fe-0b66eff68784',
    name: 'Procedimento da contratante',
    notifies: true,
    redeliveryPolicy: 'allowed',
    stage: 'delivery',
    ...extra,
  }
}

const CONTRACTOR = {
  displayName: 'COMERCIAL ZARAGOZA',
  id: 'b3a0d6f4-7c2e-4f1b-9f0a-0d6c8a1e2b11',
  status: 'active',
  taxId: '12345678000199',
}

describe('tolerância a contractorScope e contractors no tipo de ocorrência (spec 270 T1.1)', () => {
  it('aceita tipo listed com a lista de contratantes', () => {
    const types = adapters.occurrenceTypesFromApi([
      buildOccurrenceType({ contractorScope: 'listed', contractors: [CONTRACTOR] }),
    ])

    expect(types).toHaveLength(1)
    expect(types[0]?.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
  })

  it('aceita tipo all com lista vazia', () => {
    const types = adapters.occurrenceTypesFromApi([
      buildOccurrenceType({ contractorScope: 'all', contractors: [] }),
    ])

    expect(types).toHaveLength(1)
  })

  it('aceita valor desconhecido do escopo como texto (a tela trata como all)', () => {
    const types = adapters.occurrenceTypesFromApi([
      buildOccurrenceType({ contractorScope: 'qualquer', contractors: [] }),
    ])

    expect(types).toHaveLength(1)
  })

  it('aceita tipo sem as chaves (API anterior)', () => {
    expect(adapters.occurrenceTypesFromApi([buildOccurrenceType()])).toHaveLength(1)
  })

  it('aceita as chaves no tipo único (PUT)', () => {
    const type = adapters.occurrenceTypeFromApi(
      buildOccurrenceType({ contractorScope: 'listed', contractors: [CONTRACTOR] }),
    )

    expect(type.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
  })

  it('recusa forma errada das chaves', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ contractorScope: 1 })]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ contractors: 'zaragoza' })]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ contractors: [{ id: 1 }] })]),
    ).toThrow()
  })

  it('a guarda continua de chave exata para outras chaves', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ unknownScopeField: 'x' })]),
    ).toThrow()
  })
})
