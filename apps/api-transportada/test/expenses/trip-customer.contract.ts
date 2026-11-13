/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 (ADR-0116 §3): a regra provisória de a quem pertence a viagem com notas de vários clientes mora numa função só.
 */
import { describe, expect, it } from 'bun:test'

import { pickTripCustomerTaxId } from '../../src/expenses/domain/expense-trip-customer.policy.js'

const documents = [
  { senderTaxId: '22222222000122', tripDocumentId: 'd1' },
  { senderTaxId: '11111111000111', tripDocumentId: 'd2' },
  { senderTaxId: null, tripDocumentId: 'd3' },
]

describe('cliente da viagem (regra provisória: nota de maior frete)', () => {
  it('a viagem inteira vai ao emitente da nota de maior frete', () => {
    expect(
      pickTripCustomerTaxId(documents, [
        { amount: '100.0000', tripDocumentId: 'd1' },
        { amount: '350.5000', tripDocumentId: 'd2' },
      ]),
    ).toBe('11111111000111')
  })

  it('empate no frete: o menor CNPJ, para não depender da ordem de leitura', () => {
    const lines = [
      { amount: '200.0000', tripDocumentId: 'd1' },
      { amount: '200.0000', tripDocumentId: 'd2' },
    ]
    expect(pickTripCustomerTaxId(documents, lines)).toBe('11111111000111')
    expect(pickTripCustomerTaxId(documents, [...lines].reverse())).toBe('11111111000111')
  })

  it('sem emitente em nenhuma nota não há cliente', () => {
    expect(
      pickTripCustomerTaxId(documents, [{ amount: '10.0000', tripDocumentId: 'd3' }]),
    ).toBeNull()
    expect(pickTripCustomerTaxId(documents, [])).toBeNull()
  })
})
