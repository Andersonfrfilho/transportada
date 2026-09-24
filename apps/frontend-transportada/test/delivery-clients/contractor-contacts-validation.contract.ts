/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildContractorContactPayload,
  contractorContactDraftFromContact,
  CONTRACTOR_CONTACT_VALIDATION_ERROR,
  EMPTY_CONTRACTOR_CONTACT_DRAFT,
  formatContractorContactPhone,
  normalizeContractorContactEmail,
  normalizeContractorContactPhone,
  toggleContractorContactOption,
  validateContractorContactDraft,
  validateContractorContactEmail,
} from '../../src/modules/delivery-clients/shared/contractorContacts.validation'
import {
  CONTRACTOR_CONTACT_TYPES,
  type ContractorContact,
} from '../../src/modules/delivery-clients/shared/contractorContacts.types'

const OPTED_IN_CONTACT: ContractorContact = {
  canDecide: true,
  contractorId: 'contractor-1',
  email: 'compras@example.com.br',
  id: 'contact-1',
  name: 'Compradora Souza',
  occurrenceStages: ['delivery', 'stop'],
  phone: '5511999990001',
  preferredChannel: 'whatsapp',
  receivesOccurrences: true,
  roleLabel: 'Compras',
  status: 'active',
  types: ['occurrences', 'approves_charges'],
  whatsappOptInAt: '2026-09-24T18:00:00.000Z',
  whatsappOptInByUserId: 'user-1',
}

describe('contractor contacts validation (spec 150 T301, spec 143 T017)', () => {
  test('an empty email is required', () => {
    expect(validateContractorContactEmail('')).toBe(
      CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_REQUIRED,
    )
    expect(validateContractorContactEmail('   ')).toBe(
      CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_REQUIRED,
    )
  })

  test('a malformed email is invalid', () => {
    expect(validateContractorContactEmail('not-an-email')).toBe(
      CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_INVALID,
    )
  })

  test('a well-formed email passes', () => {
    expect(validateContractorContactEmail('contato@example.com.br')).toBeUndefined()
  })

  test('normalization trims and lowercases, matching the server', () => {
    expect(normalizeContractorContactEmail('  Contato@Example.com.BR  ')).toBe(
      'contato@example.com.br',
    )
  })
})

/**
 * Spec 183 T303 (P3, RF5, D6): o formulário do contato com nome, setor, telefone, tipos, grupos,
 * aceite do WhatsApp e canal preferido. A tela adianta o que a política da API (T302) recusaria, com
 * o erro no campo; a API continua sendo a última palavra.
 */
describe('o rascunho do contato com tipos e canais (spec 183 T303)', () => {
  test('contato novo nasce recebendo ocorrências dos três grupos, por e-mail, sem aceite', () => {
    expect(EMPTY_CONTRACTOR_CONTACT_DRAFT).toEqual({
      email: '',
      name: '',
      occurrenceStages: ['separation', 'delivery', 'stop'],
      phone: '',
      preferredChannel: 'email',
      roleLabel: '',
      types: ['occurrences'],
      whatsappOptIn: false,
    })
  })

  test('o telefone segue a regra do WhatsApp da API: 10/11 dígitos ganham o 55', () => {
    expect(normalizeContractorContactPhone('(11) 99999-0001')).toBe('5511999990001')
    expect(normalizeContractorContactPhone('+55 11 3333-4444')).toBe('551133334444')
    expect(normalizeContractorContactPhone('  ')).toBeNull()
    expect(normalizeContractorContactPhone('1234')).toBeUndefined()
    expect(normalizeContractorContactPhone('11 9999-000a')).toBeUndefined()
  })

  test('o telefone gravado aparece sem o 55 e com a máscara da casa', () => {
    expect(formatContractorContactPhone('5511999990001')).toBe('(11) 99999-0001')
    expect(formatContractorContactPhone(null)).toBe('')
  })

  test('editar parte do contato gravado, com o aceite marcado e o telefone mascarado', () => {
    expect(contractorContactDraftFromContact(OPTED_IN_CONTACT)).toEqual({
      email: 'compras@example.com.br',
      name: 'Compradora Souza',
      occurrenceStages: ['delivery', 'stop'],
      phone: '(11) 99999-0001',
      preferredChannel: 'whatsapp',
      roleLabel: 'Compras',
      types: ['occurrences', 'approves_charges'],
      whatsappOptIn: true,
    })
  })

  test('marcar e desmarcar mantém a ordem canônica, sem repetir', () => {
    const added = toggleContractorContactOption(
      ['invoices'],
      'occurrences',
      CONTRACTOR_CONTACT_TYPES,
    )
    expect(added).toEqual(['occurrences', 'invoices'])
    expect(toggleContractorContactOption(added, 'invoices', CONTRACTOR_CONTACT_TYPES)).toEqual([
      'occurrences',
    ])
  })

  test('cada regra da política vira erro no campo certo', () => {
    expect(validateContractorContactDraft(EMPTY_CONTRACTOR_CONTACT_DRAFT)).toEqual({
      email: CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_REQUIRED,
    })
    expect(
      validateContractorContactDraft({
        ...EMPTY_CONTRACTOR_CONTACT_DRAFT,
        email: 'a@example.com.br',
        occurrenceStages: [],
        phone: '1234',
        preferredChannel: 'whatsapp',
      }),
    ).toEqual({
      occurrenceStages: CONTRACTOR_CONTACT_VALIDATION_ERROR.OCCURRENCE_STAGES_REQUIRED,
      phone: CONTRACTOR_CONTACT_VALIDATION_ERROR.PHONE_INVALID,
      preferredChannel: CONTRACTOR_CONTACT_VALIDATION_ERROR.WHATSAPP_WITHOUT_OPT_IN,
    })
    expect(
      validateContractorContactDraft({
        ...EMPTY_CONTRACTOR_CONTACT_DRAFT,
        email: 'a@example.com.br',
        whatsappOptIn: true,
      }),
    ).toEqual({ whatsappOptIn: CONTRACTOR_CONTACT_VALIDATION_ERROR.OPT_IN_WITHOUT_PHONE })
  })

  test('sem o tipo Ocorrências, os grupos não são cobrados', () => {
    expect(
      validateContractorContactDraft({
        ...EMPTY_CONTRACTOR_CONTACT_DRAFT,
        email: 'a@example.com.br',
        occurrenceStages: [],
        types: ['invoices'],
      }),
    ).toEqual({})
  })

  test('o corpo enviado leva os campos novos normalizados, nunca os dois campos antigos', () => {
    expect(
      buildContractorContactPayload({
        email: '  Compras@Example.com.BR ',
        name: ' Compradora Souza ',
        occurrenceStages: ['delivery'],
        phone: '(11) 99999-0001',
        preferredChannel: 'whatsapp',
        roleLabel: ' Compras ',
        types: ['approves_charges', 'occurrences'],
        whatsappOptIn: true,
      }),
    ).toEqual({
      email: 'compras@example.com.br',
      name: 'Compradora Souza',
      occurrenceStages: ['delivery'],
      phone: '5511999990001',
      preferredChannel: 'whatsapp',
      roleLabel: 'Compras',
      types: ['occurrences', 'approves_charges'],
      whatsappOptIn: true,
    })
  })

  test('telefone apagado vai como null; rascunho com erro não vira corpo', () => {
    expect(
      buildContractorContactPayload({
        ...EMPTY_CONTRACTOR_CONTACT_DRAFT,
        email: 'a@example.com.br',
      })?.phone,
    ).toBeNull()
    expect(
      buildContractorContactPayload({ ...EMPTY_CONTRACTOR_CONTACT_DRAFT, email: 'x' }),
    ).toBeUndefined()
  })
})
