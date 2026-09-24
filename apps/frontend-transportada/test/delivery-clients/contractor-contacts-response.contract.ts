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
  name: '',
  occurrenceStages: ['separation', 'delivery', 'stop'],
  phone: null,
  preferredChannel: 'email',
  receivesOccurrences: true,
  roleLabel: '',
  status: 'active',
  types: ['occurrences'],
  whatsappOptInAt: null,
  whatsappOptInByUserId: null,
} as const

/** Spec 183 T302: o contato com nome, telefone, tipos e o aceite do WhatsApp carimbado. */
const OPTED_IN_CONTACT = {
  ...VALID_CONTACT,
  canDecide: true,
  name: 'Compradora Souza',
  phone: '5511999990001',
  preferredChannel: 'whatsapp',
  roleLabel: 'Compras',
  types: ['occurrences', 'approves_charges'],
  whatsappOptInAt: '2026-09-24T18:00:00.000Z',
  whatsappOptInByUserId: 'user-1',
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

  test('aceita o contato com tipos, telefone e aceite do WhatsApp (spec 183 T302)', () => {
    expect(contactFromApi({ data: OPTED_IN_CONTACT })).toEqual(OPTED_IN_CONTACT)
  })

  test('recusa tipo, grupo ou canal fora da lista fechada, e telefone que não é texto', () => {
    for (const data of [
      { ...VALID_CONTACT, types: ['marketing'] },
      { ...VALID_CONTACT, occurrenceStages: ['warehouse'] },
      { ...VALID_CONTACT, preferredChannel: 'sms' },
      { ...VALID_CONTACT, phone: 5511999990001 },
      { ...VALID_CONTACT, whatsappOptInAt: 1 },
    ]) {
      expect(() => contactFromApi({ data })).toThrow(ContractorContactsResponseError)
    }
  })
})
