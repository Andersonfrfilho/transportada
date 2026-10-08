/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  RECIPIENT_EMAIL_MAX_LENGTH,
  resolveRecipientEmail,
} from '../../src/nfe-imports/domain/recipient-email.policy.js'

describe('o e-mail do destinatário gravado pela importação', () => {
  test('endereço válido passa aparado, sem trocar a caixa', () => {
    expect(resolveRecipientEmail('  Compras@Cliente.com.br ')).toEqual({
      email: 'Compras@Cliente.com.br',
      wasRejected: false,
    })
  })

  test('tag ausente ou vazia é nulo e não conta como rejeição', () => {
    expect(resolveRecipientEmail(undefined)).toEqual({ email: null, wasRejected: false })
    expect(resolveRecipientEmail('   ')).toEqual({ email: null, wasRejected: false })
  })

  test.each(['sem-arroba', 'a@b', '@cliente.com', 'a@@cliente.com', 'a b@cliente.com'])(
    'forma inválida (%s) vira nulo e conta como rejeição',
    (value) => {
      expect(resolveRecipientEmail(value)).toEqual({ email: null, wasRejected: true })
    },
  )

  test.each(['a@x.com;b@x.com', 'a@x.com,b@x.com', 'Fulano <a@x.com>', 'a@x.com\r\nBcc: b@x.com'])(
    'lista ou cabeçalho (%j) vira nulo e conta como rejeição',
    (value) => {
      expect(resolveRecipientEmail(value)).toEqual({ email: null, wasRejected: true })
    },
  )

  test('o teto é 254 caracteres: 254 passa, 255 não', () => {
    const suffix = '@cliente.com'
    const atLimit = `${'a'.repeat(RECIPIENT_EMAIL_MAX_LENGTH - suffix.length)}${suffix}`

    expect(atLimit).toHaveLength(254)
    expect(resolveRecipientEmail(atLimit)).toEqual({ email: atLimit, wasRejected: false })
    expect(resolveRecipientEmail(`a${atLimit}`)).toEqual({ email: null, wasRejected: true })
  })
})
