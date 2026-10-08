/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): o token do endereço de entrada nasce NO SERVIDOR, com 130 bits do CSPRNG
 * (26 símbolos de 5 bits), e só o hash — o mesmo que o worker calcula — é guardado.
 */
import { createHash } from 'node:crypto'

import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import {
  buildPreviewInboundAddress,
  generatePreviewInboundToken,
  hashPreviewInboundToken,
} from '../../src/cargo-receiving/domain/preview-inbound-token.policy.js'

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const TOKEN_PATTERN = /^[a-z2-7]{26}$/u
const SAMPLE_SIZE = 2000

afterEach(() => {
  spyOn(crypto, 'getRandomValues').mockRestore()
})

describe('o token do endereço de entrada da prévia (spec 237 T4.6b)', () => {
  test('tem 26 símbolos base32 minúsculos, e dois tokens nunca se repetem', () => {
    const tokens = Array.from({ length: SAMPLE_SIZE }, () => generatePreviewInboundToken())

    for (const token of tokens) expect(token).toMatch(TOKEN_PATTERN)
    expect(new Set(tokens).size).toBe(SAMPLE_SIZE)
    const symbols = new Set(tokens.join(''))
    expect([...symbols].sort().join('')).toBe([...BASE32_ALPHABET].sort().join(''))
  })

  test('vem do CSPRNG: cada símbolo usa só os 5 bits baixos do byte, sem viés de módulo', () => {
    const bytes = Array.from({ length: 26 }, (_, index) => index % 32 | 0xe0)
    const random = spyOn(crypto, 'getRandomValues').mockImplementation(((target: Uint8Array) => {
      target.set(bytes)
      return target
    }) as never)

    const token = generatePreviewInboundToken()

    expect(random).toHaveBeenCalledTimes(1)
    expect(token).toBe(BASE32_ALPHABET.slice(0, 26))
  })

  test('o hash é o do worker: sha256 do propósito e do token, em hexadecimal', () => {
    const token = 'abcdefghijklmnopqrstuvwxyz'
    const expected = createHash('sha256')
      .update(`transportada:cargo-preview-inbound:v1:${token}`)
      .digest('hex')

    expect(hashPreviewInboundToken(token)).toBe(expected)
    expect(hashPreviewInboundToken(token)).toMatch(/^[0-9a-f]{64}$/u)
    expect(hashPreviewInboundToken(token)).not.toBe(
      createHash('sha256').update(token).digest('hex'),
    )
  })

  test('o endereço é o token no domínio de entrada, em minúsculas', () => {
    expect(
      buildPreviewInboundAddress({
        replyDomain: ' Entrada.Exemplo.Test ',
        token: 'abcdefghijklmnopqrstuvwxyz',
      }),
    ).toBe('abcdefghijklmnopqrstuvwxyz@entrada.exemplo.test')
  })
})
