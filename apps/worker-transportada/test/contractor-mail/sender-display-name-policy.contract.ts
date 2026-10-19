/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §8, D8): o worker reaplica o saneamento do "De" que a API já gravou em `from_display_name`.
 * A tabela copiada prende a paridade: o que a API grava o worker não altera; o que vier sujo é limpo.
 */
import { describe, expect, test } from 'bun:test'

import {
  SENDER_DISPLAY_NAME_MAX,
  sanitizeSenderDisplayName,
} from '../../src/contractor-mail/domain/sender-display-name.policy.js'
import { SENDER_DISPLAY_NAME_CASES } from '../fixtures/occurrence-mail-sender-name-cases.fixture.js'

describe('spec 272: saneamento do nome de exibição do "De" no worker', () => {
  test('o teto é o do CHECK de from_display_name', () => {
    expect(SENDER_DISPLAY_NAME_MAX).toBe(200)
  })

  test('a tabela copiada tem os 33 casos da API', () => {
    expect(SENDER_DISPLAY_NAME_CASES).toHaveLength(33)
  })

  test.each(SENDER_DISPLAY_NAME_CASES.map((entry) => [entry.name, entry] as const))(
    'o valor que a API grava passa intacto: %s',
    (_name, entry) => {
      expect(sanitizeSenderDisplayName(entry.expected)).toBe(entry.expected)
    },
  )

  test.each(
    SENDER_DISPLAY_NAME_CASES.filter((entry) => entry.signer.kind === 'team').map(
      (entry) => [entry.name, entry] as const,
    ),
  )('o nome de exibição sujo da equipe sai como a API gravaria: %s', (_name, entry) => {
    expect(sanitizeSenderDisplayName(entry.companyDisplayName)).toBe(entry.expected)
  })

  test.each([
    ['CRLF e injeção de cabeçalho', 'Ana\r\nBcc: x@y.z — Loja', 'Ana Bcc: x@y.z — Loja'],
    ['aspas, barra, ângulos, vírgula e ponto e vírgula', 'A"n\\a <b>, c; d', 'Ana b c d'],
    ['bidi e largura zero', 'A‮n​a؜﻿', 'Ana'],
    ['controle e separadores de linha', 'A\u0000n a\u0085b', 'A n a b'],
    [
      'formatação Cf: U+2060, U+00AD, U+180E e tag U+E0041',
      'A\u2060n\u00ADa\u180E\u{E0041}',
      'Ana',
    ],
    ['só invisíveis', '​‮', ''],
  ])('limpa: %s', (_name, dirty, clean) => {
    expect(sanitizeSenderDisplayName(dirty)).toBe(clean)
  })

  test('corta em 200 sem partir par substituto', () => {
    const result = sanitizeSenderDisplayName('😀'.repeat(150))
    expect(result.length).toBe(200)
    expect(result).toBe('😀'.repeat(100))
  })
})
