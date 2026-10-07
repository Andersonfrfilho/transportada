/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (D6): quem encaminha vale por endereço exato; o remetente original vale por endereço
 * exato ou domínio exato (nunca subdomínio nem sufixo). Lista ausente ou vazia recusa — fail-closed.
 */
import { describe, expect, test } from 'bun:test'

import { readSingleMailboxAddress } from '../../src/cargo-preview-email/domain/mailbox-address.policy.js'
import {
  isForwarderAllowed,
  isOriginalSenderAllowed,
} from '../../src/cargo-preview-email/domain/preview-sender-allowlist.policy.js'

describe('o endereço de um único remetente (spec 237 T4.6)', () => {
  test.each([
    ['ana@x.example', 'ana@x.example'],
    ['Ana Souza <Ana@X.Example>', 'ana@x.example'],
    ['"ana@a.example" <mallory@x.example>', 'mallory@x.example'],
  ])('lê %s', (value, expected) => {
    expect(readSingleMailboxAddress(value)).toBe(expected)
  })

  test.each([
    ['vazio', ''],
    ['sem arroba', 'ana'],
    ['dois endereços', 'a@x.example, b@x.example'],
    ['grupo', 'time: a@x.example, b@x.example;'],
    ['só nome', 'Ana Souza'],
    ['arroba duplo', 'a@b@x.example'],
  ])('recusa %s', (_name, value) => {
    expect(readSingleMailboxAddress(value)).toBeUndefined()
  })
})

describe('as listas de remetentes da prévia (spec 237 T4.6)', () => {
  test('o encaminhador é por endereço exato, sem caixa e sem espaço nas pontas', () => {
    const allowlist = ['Equipe@Transportadora.example']
    expect(isForwarderAllowed({ address: 'equipe@transportadora.example', allowlist })).toBe(true)
    expect(isForwarderAllowed({ address: 'outro@transportadora.example', allowlist })).toBe(false)
    expect(isForwarderAllowed({ address: 'equipe@transportadora.example.evil', allowlist })).toBe(
      false,
    )
  })

  test('o domínio da lista do encaminhador não vale: só endereço', () => {
    expect(
      isForwarderAllowed({
        address: 'a@transportadora.example',
        allowlist: ['transportadora.example'],
      }),
    ).toBe(false)
  })

  test('o remetente original vale por endereço exato ou domínio exato', () => {
    const allowlist = ['fr@contratante.example', 'logistica.example']
    expect(isOriginalSenderAllowed({ address: 'fr@contratante.example', allowlist })).toBe(true)
    expect(isOriginalSenderAllowed({ address: 'qualquer@logistica.example', allowlist })).toBe(true)
    expect(isOriginalSenderAllowed({ address: 'outro@contratante.example', allowlist })).toBe(false)
    expect(isOriginalSenderAllowed({ address: 'x@sub.logistica.example', allowlist })).toBe(false)
    expect(isOriginalSenderAllowed({ address: 'x@evillogistica.example', allowlist })).toBe(false)
    expect(isOriginalSenderAllowed({ address: 'x@logistica.example.evil', allowlist })).toBe(false)
  })

  test.each([null, []])('lista %p recusa tudo', (allowlist) => {
    expect(isForwarderAllowed({ address: 'a@b.example', allowlist })).toBe(false)
    expect(isOriginalSenderAllowed({ address: 'a@b.example', allowlist })).toBe(false)
  })
})
