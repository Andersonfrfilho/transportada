/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.4 (ADR-0110 §8, D8): o nome de exibição do "De". A tabela `SENDER_DISPLAY_NAME_CASES` é dado puro: o
 * worker a copia por valor (T3.1) e reaplica o mesmo saneamento.
 */
import { describe, expect, test } from 'bun:test'

import {
  SENDER_DISPLAY_NAME_CASES,
  SENDER_DISPLAY_NAME_MAX,
  buildSenderDisplayName,
} from '../../src/occurrence-conversation/domain/occurrence-mail-sender-name.policy.js'

// Os caracteres proibidos entram por escape: nunca o literal no fonte (Trojan Source).
const FORBIDDEN =
  /[\p{Cc}\u{2028}\u{2029}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{200B}-\u{200F}\u{061C}\u{FEFF}\p{Cf}<>"\\,;]/u

describe('spec 272 D8: o nome do "De"', () => {
  test('a tabela de casos tem ao menos vinte casos', () => {
    expect(SENDER_DISPLAY_NAME_CASES.length).toBeGreaterThanOrEqual(20)
  })

  test.each(SENDER_DISPLAY_NAME_CASES.map((entry) => [entry.name, entry] as const))(
    '%s',
    (_name, entry) => {
      const result = buildSenderDisplayName({
        companyDisplayName: entry.companyDisplayName,
        signer: entry.signer,
      })
      expect(result).toBe(entry.expected)
      expect(result.length).toBeLessThanOrEqual(SENDER_DISPLAY_NAME_MAX)
      expect(FORBIDDEN.test(result)).toBe(false)
      expect(result).toBe(result.trim())
      expect(result).not.toMatch(/\s{2,}/u)
    },
  )

  test('equipe: só o nome de exibição; pessoa: "<nome> — <nome de exibição>"', () => {
    expect(
      buildSenderDisplayName({ companyDisplayName: 'Tapete Mágico', signer: { kind: 'team' } }),
    ).toBe('Tapete Mágico')
    expect(
      buildSenderDisplayName({
        companyDisplayName: 'Tapete Mágico',
        signer: { kind: 'operator', name: 'Ana Lima', userId: 'u' },
      }),
    ).toBe('Ana Lima — Tapete Mágico')
  })

  test('o dono (273) assina como a pessoa', () => {
    expect(
      buildSenderDisplayName({
        companyDisplayName: 'Tapete Mágico',
        signer: { kind: 'owner', name: 'Carla', userId: 'u' },
      }),
    ).toBe('Carla — Tapete Mágico')
  })
})
