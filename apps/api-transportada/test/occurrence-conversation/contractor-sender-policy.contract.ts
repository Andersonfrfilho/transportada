/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T406 (RF16): quem respondeu, puxado do cadastro na leitura. O remetente casa com os
 * contatos **daquela** contratante (e-mail sem diferença de caixa, telefone pelos dígitos); o
 * endereço como chegou fica sempre ao lado. Fora dos contatos, a mensagem mostra o nome do `From` e
 * a sugestão de cadastro — o contato nunca é criado sozinho.
 */
import { describe, expect, test } from 'bun:test'

import {
  identifyContractorSender,
  type ContractorSenderContact,
} from '../../src/occurrence-conversation/domain/contractor-sender.policy.js'

const CONTRACTOR_ID = 'contractor-alfa'

function contact(overrides: Partial<ContractorSenderContact> = {}): ContractorSenderContact {
  return {
    contractorId: CONTRACTOR_ID,
    email: 'compras@alfa.example.test',
    id: 'contact-1',
    name: 'Maria Souza',
    phone: '5511987654321',
    preferredChannel: 'email',
    roleLabel: 'Compras',
    status: 'active',
    types: ['occurrences', 'approves_charges'],
    whatsappOptInAt: null,
    ...overrides,
  }
}

describe('a identificação do remetente da contratante (spec 183 T406)', () => {
  test.each([
    ['caixa igual', 'compras@alfa.example.test'],
    ['caixa diferente', 'Compras@ALFA.example.test'],
    ['espaço em volta', '  compras@alfa.example.test '],
  ])('e-mail casa com %s', (_label, address) => {
    expect(
      identifyContractorSender({
        address,
        channel: 'email',
        contacts: [contact()],
        contractorId: CONTRACTOR_ID,
        displayName: 'Outro Nome',
      }),
    ).toEqual({
      arrivedAs: address,
      contact: contact(),
      inactive: false,
      kind: 'contact',
      profileName: null,
    })
  })

  test('contato de outra contratante da mesma empresa não casa', () => {
    const identity = identifyContractorSender({
      address: 'compras@alfa.example.test',
      channel: 'email',
      contacts: [contact({ contractorId: 'contractor-beta' })],
      contractorId: CONTRACTOR_ID,
      displayName: 'Maria Souza',
    })
    expect(identity.kind).toBe('unknown')
  })

  test('contato inativo casa e aparece como inativo; o ativo vence o inativo do mesmo e-mail', () => {
    const inactive = contact({ id: 'contact-old', status: 'inactive' })
    expect(
      identifyContractorSender({
        address: 'compras@alfa.example.test',
        channel: 'email',
        contacts: [inactive],
        contractorId: CONTRACTOR_ID,
        displayName: null,
      }),
    ).toMatchObject({ contact: { id: 'contact-old' }, inactive: true, kind: 'contact' })
    expect(
      identifyContractorSender({
        address: 'compras@alfa.example.test',
        channel: 'email',
        contacts: [inactive, contact()],
        contractorId: CONTRACTOR_ID,
        displayName: null,
      }),
    ).toMatchObject({ contact: { id: 'contact-1' }, inactive: false })
  })

  test('fora dos contatos devolve o nome do From e a sugestão de cadastro já preenchida', () => {
    expect(
      identifyContractorSender({
        address: 'Joao@Alfa.example.test',
        channel: 'email',
        contacts: [contact()],
        contractorId: CONTRACTOR_ID,
        displayName: 'João Lima',
      }),
    ).toEqual({
      arrivedAs: 'Joao@Alfa.example.test',
      displayName: 'João Lima',
      kind: 'unknown',
      suggestion: { email: 'joao@alfa.example.test', name: 'João Lima', phone: null },
    })
  })

  test('fora dos contatos e sem nome no From, a sugestão vem com nome vazio', () => {
    expect(
      identifyContractorSender({
        address: 'joao@alfa.example.test',
        channel: 'email',
        contacts: [],
        contractorId: CONTRACTOR_ID,
        displayName: null,
      }),
    ).toMatchObject({
      displayName: null,
      suggestion: { email: 'joao@alfa.example.test', name: '' },
    })
  })

  test('no WhatsApp casa pelos dígitos, e o nome do perfil diferente do cadastro aparece junto', () => {
    expect(
      identifyContractorSender({
        address: '+55 11 98765-4321',
        channel: 'whatsapp',
        contacts: [contact()],
        contractorId: CONTRACTOR_ID,
        displayName: 'Maria (Alfa)',
      }),
    ).toMatchObject({ contact: { id: 'contact-1' }, kind: 'contact', profileName: 'Maria (Alfa)' })
    expect(
      identifyContractorSender({
        address: '5511987654321',
        channel: 'whatsapp',
        contacts: [contact()],
        contractorId: CONTRACTOR_ID,
        displayName: 'Maria Souza',
      }),
    ).toMatchObject({ profileName: null })
  })

  test('no WhatsApp o número desconhecido sugere o telefone, nunca o e-mail', () => {
    expect(
      identifyContractorSender({
        address: '5511900000000',
        channel: 'whatsapp',
        contacts: [contact()],
        contractorId: CONTRACTOR_ID,
        displayName: 'Alguém',
      }),
    ).toMatchObject({
      kind: 'unknown',
      suggestion: { email: null, name: 'Alguém', phone: '5511900000000' },
    })
  })
})
