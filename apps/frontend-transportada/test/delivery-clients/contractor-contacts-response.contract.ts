/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  contactFromApi,
  contactsFromApi,
  ContractorContactsResponseError,
  contractorsFromApi,
} from '../../src/modules/delivery-clients/shared/contractorContactsResponse.validation'

const VALID_CONTACT = {
  canDecide: false,
  contractorId: 'contractor-1',
  email: 'contato@example.com.br',
  id: 'contact-1',
  receivesOccurrences: true,
  status: 'active',
} as const

const VALID_CONTRACTOR = {
  closingPeriod: 'monthly',
  displayName: 'Spani Atacadista',
  id: 'contractor-1',
  notes: '',
  reportEmail: '',
  status: 'active',
  taxId: '12345678000100',
} as const

describe('contractor contacts response validation (spec 150 T301, spec 143 T017)', () => {
  test('accepts the real shape of a contact', () => {
    expect(contactFromApi({ data: VALID_CONTACT })).toEqual(VALID_CONTACT)
  })

  test('accepts a list of contacts', () => {
    expect(contactsFromApi({ data: [VALID_CONTACT] })).toEqual([VALID_CONTACT])
  })

  /**
   * Risco documentado em `contractor-mail-response.contract.ts`: a superfície é um array de linhas
   * — a lista inteira reprova (nunca uma linha silenciosamente sumindo do `.map`) quando uma delas
   * traz um campo a mais ou falta um campo obrigatório.
   */
  test('rejects the whole list when one row carries an unknown field', () => {
    expect(() =>
      contactsFromApi({ data: [VALID_CONTACT, { ...VALID_CONTACT, companyId: 'leaked' }] }),
    ).toThrow(ContractorContactsResponseError)
  })

  test('rejects a contact missing a required field', () => {
    const withoutEmail: Record<string, unknown> = { ...VALID_CONTACT }
    delete withoutEmail.email
    expect(() => contactFromApi({ data: withoutEmail })).toThrow(ContractorContactsResponseError)
  })

  test('rejects an unknown status', () => {
    expect(() => contactFromApi({ data: { ...VALID_CONTACT, status: 'archived' } })).toThrow(
      ContractorContactsResponseError,
    )
  })

  test('reduces the full contractor aggregate to the three fields this picker needs', () => {
    expect(contractorsFromApi({ data: [VALID_CONTRACTOR] })).toEqual([
      { displayName: 'Spani Atacadista', id: 'contractor-1', taxId: '12345678000100' },
    ])
  })
})
