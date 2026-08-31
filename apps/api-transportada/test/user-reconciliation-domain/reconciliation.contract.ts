/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os degraus do casamento e o que nunca casa são do pacote
 * `@adatechnology/identity-reconciliation`, e os testes deles moram lá. O que se prova aqui é **a
 * extração**: traduzir o vocabulário do TransportAdA para o contrato de vínculo. É a metade que o
 * pacote não pode saber, e a que erra na prática — um mapeamento que olhasse só a coluna `email`
 * entregaria conjunto vazio para quase toda conta desta instalação.
 */
import { describe, expect, test } from 'bun:test'

import {
  RECONCILIATION_MATCH,
  RECONCILIATION_STATUS,
  reconcileIdentities,
  type LocalIdentityRecord,
  type RealmIdentityRecord,
} from '../../src/identity/domain/user-reconciliation.policy.js'

function localOf(overrides: Partial<LocalIdentityRecord> = {}): LocalIdentityRecord {
  return {
    contactAddress: '',
    contactChannel: 'email',
    email: 'ana@transportada.test',
    hasProfile: true,
    membershipId: 'membership-1',
    name: 'Ana Fiscal',
    taxId: '12345678909',
    userId: 'user-1',
    username: 'ana.fiscal',
    ...overrides,
  }
}

function realmOf(overrides: Partial<RealmIdentityRecord> = {}): RealmIdentityRecord {
  return {
    email: 'ana@transportada.test',
    enabled: true,
    subject: 'subject-1',
    taxId: '',
    username: 'ana',
    ...overrides,
  }
}

describe('extração — de onde saem os e-mails da pessoa', () => {
  /**
   * O convite grava o endereço em `contact_address`, e `email` fica vazio na maioria das contas.
   * Sem incluir o contato, o degrau do e-mail não acha praticamente ninguém nesta instalação.
   */
  test('o contato entra no conjunto quando o canal é e-mail', () => {
    const local = localOf({ contactAddress: 'ana@transportada.test', email: '', taxId: '' })
    const [entry] = reconcileIdentities({ local: [local], realm: [realmOf()] })

    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.EMAIL)
  })

  test('a coluna e o contato convivem: qualquer um dos dois casa', () => {
    const local = localOf({
      contactAddress: 'pessoal@outro.test',
      email: 'ana@transportada.test',
      taxId: '',
    })
    const [byColumn] = reconcileIdentities({ local: [local], realm: [realmOf()] })
    const [byContact] = reconcileIdentities({
      local: [local],
      realm: [realmOf({ email: 'pessoal@outro.test' })],
    })

    expect(byColumn?.matchedBy).toBe(RECONCILIATION_MATCH.EMAIL)
    expect(byContact?.matchedBy).toBe(RECONCILIATION_MATCH.EMAIL)
  })

  /** Telefone num conjunto de e-mails casaria por engano com outro telefone no campo errado. */
  test('contato de WhatsApp não vira e-mail', () => {
    const local = localOf({
      contactAddress: '11999998888',
      contactChannel: 'whatsapp',
      email: '',
      taxId: '',
    })
    const [entry] = reconcileIdentities({
      local: [local],
      realm: [realmOf({ email: '11999998888' })],
    })

    expect(entry?.status).toBe(RECONCILIATION_STATUS.MISSING_IN_REALM)
  })
})

describe('extração — o documento e o vínculo', () => {
  test('o CPF do perfil é o documento do contrato, e vence o e-mail', () => {
    const realm = [
      realmOf({ email: 'ana@transportada.test', subject: 'por-email', taxId: '' }),
      realmOf({ email: 'outro@x.test', subject: 'por-documento', taxId: '123.456.789-09' }),
    ]
    const [entry] = reconcileIdentities({ local: [localOf()], realm })

    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.DOCUMENT)
    expect(entry?.realm?.subject).toBe('por-documento')
  })

  test('o subject gravado é o degrau mais forte', () => {
    const local = localOf({ email: 'nao-bate@x.test', subject: 'subject-1', taxId: '' })
    const [entry] = reconcileIdentities({ local: [local], realm: [realmOf()] })

    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.SUBJECT)
  })
})

describe('a volta — a ficha inteira, não só a chave', () => {
  /**
   * O contrato devolve `id` e `subject`; a tela precisa de nome, vínculo e situação. A volta é por
   * chave, e não por posição: as contas órfãs do provedor entram no fim da lista.
   */
  test('devolve os registros do produto, dos dois lados', () => {
    const orfa = realmOf({ email: 'ninguem@x.test', subject: 'subject-orfa', username: 'ninguem' })
    const entries = reconcileIdentities({ local: [localOf()], realm: [realmOf(), orfa] })

    expect(entries[0]?.local?.membershipId).toBe('membership-1')
    expect(entries[0]?.local?.name).toBe('Ana Fiscal')
    expect(entries[0]?.realm?.username).toBe('ana')
    expect(entries[1]?.status).toBe(RECONCILIATION_STATUS.MISSING_LOCALLY)
    expect(entries[1]?.realm?.username).toBe('ninguem')
    expect(entries[1]?.local).toBeUndefined()
  })

  test('vínculo sem conta no realm continua chegando com a ficha', () => {
    const [entry] = reconcileIdentities({ local: [localOf()], realm: [] })

    expect(entry?.status).toBe(RECONCILIATION_STATUS.MISSING_IN_REALM)
    expect(entry?.local?.name).toBe('Ana Fiscal')
  })
})
