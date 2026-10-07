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
    ['dois pares de <>', 'x <a@c.example> <b@evil.example>'],
    ['comentário com outro endereço', 'a@c.example (b@evil.example)'],
    ['grupo com um endereço', 'grupo: a@x.example;'],
    ['prefixo mailto:', 'mailto:a@c.example'],
    ['mailto dentro de <>', 'Ana <mailto:a@c.example>'],
    ['Outlook com mailto diferente do endereço', 'Ana <a@c.example<mailto:b@evil.example>>'],
    ['Outlook clássico com outro endereço no nome', 'b@evil.example [mailto:a@c.example]'],
    ['nome codificado (RFC 2047) que só decodifica para endereço', '=?utf-8?q?a=40c.example?='],
    ['nome codificado e nenhum endereço real', '=?utf-8?b?YUBjLmV4YW1wbGU=?= <>'],
    ['colchetes no endereço', 'a@[10.0.0.1]'],
    ['texto depois do >', 'Ana <a@c.example> extra'],
    ['aspas sem endereço', '"a@c.example"'],
    ['nome entre aspas e endereço sem <>', '"Ana" a@c.example'],
  ])('recusa %s', (_name, value) => {
    expect(readSingleMailboxAddress(value)).toBeUndefined()
  })

  test.each([
    [
      'Outlook texto',
      'Fulano <fr@cliente.example<mailto:fr@cliente.example>>',
      'fr@cliente.example',
    ],
    ['Outlook clássico', 'Fulano [mailto:FR@Cliente.example]', 'fr@cliente.example'],
    [
      'Outlook clássico com o nome igual ao endereço',
      'fr@cliente.example [mailto:fr@cliente.example]',
      'fr@cliente.example',
    ],
    ['nome entre aspas com vírgula', '"Silva, Fulano" <fr@cliente.example>', 'fr@cliente.example'],
    [
      'nome codificado (RFC 2047) e endereço real',
      '=?utf-8?q?Jo=C3=A3o?= <fr@cliente.example>',
      'fr@cliente.example',
    ],
  ])('lê %s', (_name, value, expected) => {
    expect(readSingleMailboxAddress(value)).toBe(expected)
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

  test('entrada que não é texto (null, número, vazia) é ignorada sem lançar, e as boas continuam valendo', () => {
    const allowlist = [null, 7, undefined, '', '   ', 'fr@contratante.example'] as never
    expect(isOriginalSenderAllowed({ address: 'fr@contratante.example', allowlist })).toBe(true)
    expect(isOriginalSenderAllowed({ address: 'outro@contratante.example', allowlist })).toBe(false)
    expect(isForwarderAllowed({ address: 'fr@contratante.example', allowlist })).toBe(true)
    expect(isForwarderAllowed({ address: '', allowlist })).toBe(false)
  })

  test.each([[null], [[]]])('lista %p recusa tudo', (allowlist) => {
    expect(isForwarderAllowed({ address: 'a@b.example', allowlist })).toBe(false)
    expect(isOriginalSenderAllowed({ address: 'a@b.example', allowlist })).toBe(false)
  })
})
