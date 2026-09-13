/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildReplyAddress,
  generateReplyToken,
  hashReplyToken,
} from '../../src/contractor-mail/domain/reply-token.policy'

const BASE32_LOWERCASE_TOKEN_PATTERN = /^[a-z2-7]{26}$/
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/

describe('contractor mail reply token policy (spec 143, T009, RF2)', () => {
  test('generates a 128-bit token in lowercase base32, without padding', () => {
    const { token } = generateReplyToken()

    expect(token).toMatch(BASE32_LOWERCASE_TOKEN_PATTERN)
    expect(token).toBe(token.toLowerCase())
  })

  test('the hash is a lowercase hex sha256 of the plaintext token, matching the reply_token_hash CHECK', () => {
    const { token, tokenHash } = generateReplyToken()

    expect(tokenHash).toMatch(HEX_SHA256_PATTERN)
    expect(tokenHash).toBe(hashReplyToken(token))
  })

  test('never generates the same token twice in a row', () => {
    const first = generateReplyToken()
    const second = generateReplyToken()

    expect(first.token).not.toBe(second.token)
    expect(first.tokenHash).not.toBe(second.tokenHash)
  })

  test('the same token always hashes to the same value', () => {
    const { token, tokenHash } = generateReplyToken()

    expect(hashReplyToken(token)).toBe(tokenHash)
  })

  test('builds the reply address as <token>@<replyDomain>, without a plus sign', () => {
    const address = buildReplyAddress({
      replyDomain: 'resposta.fernandes-transportadora.com.br',
      token: 'abcdefghijklmnopqrstuvwxyz',
    })

    expect(address).toBe('abcdefghijklmnopqrstuvwxyz@resposta.fernandes-transportadora.com.br')
    expect(address).not.toContain('+')
  })
})
