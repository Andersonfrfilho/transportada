/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildReplyAddress,
  deriveReplyToken,
  generateReplyTokenSecret,
  hashReplyToken,
} from '../../src/contractor-mail/domain/reply-token.policy'

const BASE32_LOWERCASE_TOKEN_PATTERN = /^[a-z2-7]{26}$/
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/
const REPLY_TOKEN_SECRET_PATTERN = /^[0-9a-f]{64}$/

const COMPANY_ID = '00000000-0000-4000-8000-0000000000f1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000f2'
const THREAD_ID = '00000000-0000-4000-8000-0000000000f3'
const OTHER_THREAD_ID = '00000000-0000-4000-8000-0000000000f4'

describe('contractor mail reply token policy (spec 143, T009 — correção pós-entrega, RF2/RF7)', () => {
  test('generates a 32-byte secret in lowercase hex', () => {
    const secret = generateReplyTokenSecret()

    expect(secret).toMatch(REPLY_TOKEN_SECRET_PATTERN)
  })

  test('never generates the same secret twice in a row', () => {
    expect(generateReplyTokenSecret()).not.toBe(generateReplyTokenSecret())
  })

  test('derives a 128-bit token in lowercase base32, without padding', () => {
    const secret = generateReplyTokenSecret()

    const token = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: secret,
      threadId: THREAD_ID,
    })

    expect(token).toMatch(BASE32_LOWERCASE_TOKEN_PATTERN)
    expect(token).toBe(token.toLowerCase())
  })

  /** RF7: a mesma conversa precisa do mesmo Reply-To em todo envio, não só no primeiro. */
  test('derives the exact same token for the same secret, company and thread every time', () => {
    const secret = generateReplyTokenSecret()

    const first = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: secret,
      threadId: THREAD_ID,
    })
    const second = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: secret,
      threadId: THREAD_ID,
    })

    expect(first).toBe(second)
  })

  test('derives a different token for a different conversation of the same company', () => {
    const secret = generateReplyTokenSecret()

    const first = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: secret,
      threadId: THREAD_ID,
    })
    const second = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: secret,
      threadId: OTHER_THREAD_ID,
    })

    expect(first).not.toBe(second)
  })

  test('derives a different token for the same thread id under a different company', () => {
    const secret = generateReplyTokenSecret()

    const first = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: secret,
      threadId: THREAD_ID,
    })
    const second = deriveReplyToken({
      companyId: OTHER_COMPANY_ID,
      replyTokenSecret: secret,
      threadId: THREAD_ID,
    })

    expect(first).not.toBe(second)
  })

  test('derives a different token for the same conversation under a different secret', () => {
    const first = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: generateReplyTokenSecret(),
      threadId: THREAD_ID,
    })
    const second = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: generateReplyTokenSecret(),
      threadId: THREAD_ID,
    })

    expect(first).not.toBe(second)
  })

  test('the hash is a lowercase hex sha256 of the plaintext token, matching the reply_token_hash CHECK', () => {
    const token = deriveReplyToken({
      companyId: COMPANY_ID,
      replyTokenSecret: generateReplyTokenSecret(),
      threadId: THREAD_ID,
    })

    const tokenHash = hashReplyToken(token)

    expect(tokenHash).toMatch(HEX_SHA256_PATTERN)
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
