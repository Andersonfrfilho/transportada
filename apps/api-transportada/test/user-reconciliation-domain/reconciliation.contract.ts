/**
 * Copyright (c) 2026 Ada Technology. MIT License.
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
    membershipId: 'membership-1',
    name: 'Ana Fiscal',
    taxId: '12345678909',
    userId: 'user-1',
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

describe('reconciliação — os três degraus de confiança', () => {
  test('o vínculo gravado vence, e não depende de e-mail nenhum', () => {
    const local = localOf({ email: 'outro@transportada.test', subject: 'subject-1' })
    const [entry] = reconcileIdentities({ local: [local], realm: [realmOf()] })

    expect(entry?.status).toBe(RECONCILIATION_STATUS.LINKED)
    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.SUBJECT)
  })

  test('sem vínculo, o e-mail casa ignorando caixa e espaço', () => {
    const local = localOf({ email: '  Ana@Transportada.TEST ' })
    const [entry] = reconcileIdentities({ local: [local], realm: [realmOf()] })

    expect(entry?.status).toBe(RECONCILIATION_STATUS.LINKED)
    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.EMAIL)
  })

  /**
   * A pessoa tem um documento só e pode ter vários e-mails: o documento decide, e o e-mail é o
   * desempate de quem ainda não tem documento cadastrado.
   */
  test('quando os dois discordam, o documento vence o e-mail', () => {
    const local = localOf({ email: 'ana@transportada.test', taxId: '12345678909' })
    const realm = [
      realmOf({ email: 'ana@transportada.test', subject: 'subject-email', taxId: '' }),
      realmOf({ email: 'ana.pessoal@outro.test', subject: 'subject-doc', taxId: '123.456.789-09' }),
    ]
    const [entry] = reconcileIdentities({ local: [local], realm })

    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.TAX_ID)
    expect(entry?.realm?.subject).toBe('subject-doc')
  })

  test('o documento casa sem máscara, quando o realm o tiver', () => {
    const local = localOf({ email: 'nao-bate@transportada.test', taxId: '123.456.789-09' })
    const realm = realmOf({ email: 'outro@transportada.test', taxId: '12345678909' })
    const [entry] = reconcileIdentities({ local: [local], realm: [realm] })

    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.TAX_ID)
  })
})

describe('reconciliação — quem falta de cada lado', () => {
  test('membership sem conta no realm é quem não consegue entrar', () => {
    const [entry] = reconcileIdentities({ local: [localOf()], realm: [] })

    expect(entry?.status).toBe(RECONCILIATION_STATUS.MISSING_IN_REALM)
    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.NONE)
    expect(entry?.realm).toBeUndefined()
  })

  /** O caso que originou a tela: conta no Keycloak que ninguém aqui reivindica. */
  test('conta no realm sem membership aparece, em vez de sumir', () => {
    const entries = reconcileIdentities({ local: [], realm: [realmOf()] })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe(RECONCILIATION_STATUS.MISSING_LOCALLY)
    expect(entries[0]?.local).toBeUndefined()
  })

  test('os dois lados vazios não inventam linha', () => {
    expect(reconcileIdentities({ local: [], realm: [] })).toEqual([])
  })
})

describe('reconciliação — o que não pode casar', () => {
  /**
   * Duas pessoas sem CPF cadastrado não são a mesma pessoa. Casar vazio com vazio esconderia uma
   * delas da tela para sempre, que é o defeito exato que esta tela existe para consertar.
   */
  test('chave em branco não casa com chave em branco', () => {
    const local = localOf({ email: '', taxId: '' })
    const realm = realmOf({ email: '', taxId: '' })
    const entries = reconcileIdentities({ local: [local], realm: [realm] })

    expect(entries.map((entry) => entry.status)).toEqual([
      RECONCILIATION_STATUS.MISSING_IN_REALM,
      RECONCILIATION_STATUS.MISSING_LOCALLY,
    ])
  })

  test('uma conta do realm serve a uma pessoa só', () => {
    const first = localOf({ subject: 'subject-1', userId: 'user-1' })
    const second = localOf({ membershipId: 'membership-2', userId: 'user-2' })
    const entries = reconcileIdentities({ local: [first, second], realm: [realmOf()] })

    expect(entries[0]?.status).toBe(RECONCILIATION_STATUS.LINKED)
    // O segundo tem o mesmo e-mail, mas a conta já foi reivindicada pelo vínculo gravado.
    expect(entries[1]?.status).toBe(RECONCILIATION_STATUS.MISSING_IN_REALM)
  })

  test('o realm com a mesma chave duas vezes não duplica o casamento', () => {
    const realm = [realmOf(), realmOf({ subject: 'subject-2', username: 'ana.2' })]
    const entries = reconcileIdentities({ local: [localOf()], realm })

    expect(entries[0]?.status).toBe(RECONCILIATION_STATUS.LINKED)
    expect(entries[1]?.status).toBe(RECONCILIATION_STATUS.MISSING_LOCALLY)
    expect(entries[1]?.realm?.subject).toBe('subject-2')
  })
})

describe('reconciliação — o e-mail mora no contato', () => {
  /**
   * O convite grava o endereço em `contact_address`, e `email` fica vazio na maioria das contas.
   * Casar só pela coluna `email` fazia o degrau do e-mail não achar praticamente ninguém.
   */
  test('casa pelo contato quando o canal é e-mail e a coluna está vazia', () => {
    const local = localOf({ contactAddress: 'ana@transportada.test', email: '' })
    const [entry] = reconcileIdentities({ local: [local], realm: [realmOf()] })

    expect(entry?.matchedBy).toBe(RECONCILIATION_MATCH.EMAIL)
  })

  test('contato de telefone não vira chave de e-mail', () => {
    const local = localOf({ contactAddress: '11999998888', contactChannel: 'whatsapp', email: '' })
    const [entry] = reconcileIdentities({ local: [local], realm: [realmOf()] })

    expect(entry?.status).toBe(RECONCILIATION_STATUS.MISSING_IN_REALM)
  })
})
