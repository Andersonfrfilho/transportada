/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseSenderMailbox } from '../../src/contractor-mail/domain/sender-mailbox.policy.js'

/**
 * Spec 183 T406 (RF16): o `From` do e-mail recebido vira endereço (é por ele que o remetente casa
 * com os contatos) e nome (é o que aparece para quem está fora dos contatos). O endereço fica como
 * chegou — a caixa é problema da comparação, não da gravação.
 */
describe('o remetente do e-mail recebido (spec 183 T406)', () => {
  test.each([
    ['Maria Souza <Maria@Alfa.example.test>', 'Maria@Alfa.example.test', 'Maria Souza'],
    ['"Souza, Maria" <maria@alfa.example.test>', 'maria@alfa.example.test', 'Souza, Maria'],
    ['maria@alfa.example.test', 'maria@alfa.example.test', null],
    ['<maria@alfa.example.test>', 'maria@alfa.example.test', null],
    ['  Compras   Alfa  <compras@alfa.example.test> ', 'compras@alfa.example.test', 'Compras Alfa'],
    ['maria@alfa.example.test <maria@alfa.example.test>', 'maria@alfa.example.test', null],
    ['"" <maria@alfa.example.test>', 'maria@alfa.example.test', null],
  ])('%s', (from, address, displayName) => {
    expect(parseSenderMailbox(from)).toEqual({ address, displayName })
  })

  test('nome sem controle de linha e com no máximo 200 caracteres (CHECK do banco)', () => {
    expect(parseSenderMailbox('Maria\r\nBcc: x <maria@alfa.example.test>')).toEqual({
      address: 'maria@alfa.example.test',
      displayName: 'Maria Bcc: x',
    })
    const long = parseSenderMailbox(`${'a'.repeat(250)} <maria@alfa.example.test>`)
    expect(long.displayName?.length).toBe(200)
  })

  test('o que não tem forma de endereço fica como chegou, sem nome', () => {
    expect(parseSenderMailbox('remetente estranho')).toEqual({
      address: 'remetente estranho',
      displayName: null,
    })
  })
})
