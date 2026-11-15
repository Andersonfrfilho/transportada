/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_QUOTE_DRAFT,
  buildAddressSubmission,
  buildQuoteSubmission,
  type AddressDraft,
} from '../../src/modules/freight-quote/shared/freightQuoteForm.service'

const ADDRESS: AddressDraft = {
  city: 'Ribeirão Preto',
  district: 'Centro',
  number: '100',
  postalCode: '14010-000',
  state: 'sp',
  street: 'Rua A',
}

describe('cotação por endereço (spec 342): o painel só manda endereços', () => {
  test('o rascunho vazio não fecha e o completo normaliza CEP e UF', () => {
    expect(buildQuoteSubmission(EMPTY_QUOTE_DRAFT)).toBeNull()
    expect(buildAddressSubmission(ADDRESS)).toEqual({
      ...ADDRESS,
      postalCode: '14010000',
      state: 'SP',
    })
    expect(buildAddressSubmission({ ...ADDRESS, postalCode: '1401' })).toBeNull()
  })

  test('o envio nunca leva distância nem pedágio', () => {
    const submission = buildQuoteSubmission({
      ...EMPTY_QUOTE_DRAFT,
      destination: ADDRESS,
      origin: ADDRESS,
    })
    expect(submission).not.toBeNull()
    expect(Object.keys(submission ?? {})).not.toContain('distanceKm')
    expect(Object.keys(submission ?? {})).not.toContain('tollAmount')
  })
})
