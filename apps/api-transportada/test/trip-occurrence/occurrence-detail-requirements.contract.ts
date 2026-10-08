/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b N2): o requisito EFETIVO que o detalhe da ocorrência publica — o painel esconde e
 * rotula os campos por ele, sem depender da lista de tipos (que exige `settings.manage`). O escopo do
 * valor pago já vem refinado: Produtos desligado ou nota sem produto leva o valor para a ocorrência.
 */
import { describe, expect, test } from 'bun:test'

import { buildOccurrenceDetailRequirements } from '../../src/trips/domain/occurrence-detail-requirements.policy.js'
import type { OccurrenceRequirements } from '../../src/trips/domain/occurrence-requirements.policy.js'

function requirements(overrides: Partial<OccurrenceRequirements>): OccurrenceRequirements {
  return {
    declaredAmountLabel: 'Valor pago',
    declaredAmountMode: 'optional',
    declaredAmountScope: 'item',
    itemsMinimumCount: null,
    itemsMode: 'optional',
    noteMode: 'optional',
    photoMinimumCount: 1,
    photoMode: 'off',
    referenceNumberLabel: 'NFD',
    referenceNumberMode: 'required',
    signatureMode: 'off',
    ...overrides,
  }
}

describe('o requisito efetivo do detalhe da ocorrência (spec 247 T7.2b N2)', () => {
  test('publica só os seis campos combinados, com modos e rótulos do efetivo', () => {
    const published = buildOccurrenceDetailRequirements({
      productCount: 2,
      requirements: requirements({}),
    })

    expect(published).toEqual({
      declaredAmountLabel: 'Valor pago',
      declaredAmountMode: 'optional',
      declaredAmountScope: 'item',
      itemsMode: 'optional',
      referenceNumberLabel: 'NFD',
      referenceNumberMode: 'required',
    })
  })

  test('escopo item com Produtos desligado no efetivo vira ocorrência', () => {
    const published = buildOccurrenceDetailRequirements({
      productCount: 2,
      requirements: requirements({ declaredAmountScope: 'item', itemsMode: 'off' }),
    })

    expect(published.declaredAmountScope).toBe('occurrence')
  })

  test('escopo item numa nota sem produto vira ocorrência', () => {
    const published = buildOccurrenceDetailRequirements({
      productCount: 0,
      requirements: requirements({ declaredAmountScope: 'item' }),
    })

    expect(published.declaredAmountScope).toBe('occurrence')
  })

  test('escopo ocorrência continua ocorrência, e item com produtos continua item', () => {
    expect(
      buildOccurrenceDetailRequirements({
        productCount: 3,
        requirements: requirements({ declaredAmountScope: 'occurrence' }),
      }).declaredAmountScope,
    ).toBe('occurrence')
    expect(
      buildOccurrenceDetailRequirements({
        productCount: 3,
        requirements: requirements({ declaredAmountScope: 'item', itemsMode: 'required' }),
      }).declaredAmountScope,
    ).toBe('item')
  })
})
