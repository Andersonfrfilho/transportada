/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { extractReplyToken } from '../../src/contractor-mail/domain/recipient-reply-token.policy.js'

const REPLY_DOMAIN = 'resposta.fernandes-transportadora.com.br'

describe('recipient reply token policy (spec 143, T010)', () => {
  test('extracts the local-part of the address matching the reply domain', () => {
    const token = extractReplyToken({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`abc123token@${REPLY_DOMAIN}`],
    })
    expect(token).toBe('abc123token')
  })

  test('extracts the token from a "Name <address>" formatted recipient', () => {
    const token = extractReplyToken({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`Ocorrências <abc123token@${REPLY_DOMAIN}>`],
    })
    expect(token).toBe('abc123token')
  })

  test('picks the matching address among several recipients (cc / forwarded)', () => {
    const token = extractReplyToken({
      replyDomain: REPLY_DOMAIN,
      toAddresses: ['someone-else@example.com', `abc123token@${REPLY_DOMAIN}`],
    })
    expect(token).toBe('abc123token')
  })

  test('matches the domain case-insensitively', () => {
    const token = extractReplyToken({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`abc123token@${REPLY_DOMAIN.toUpperCase()}`],
    })
    expect(token).toBe('abc123token')
  })

  test('returns undefined when no recipient matches the reply domain', () => {
    const token = extractReplyToken({
      replyDomain: REPLY_DOMAIN,
      toAddresses: ['someone@a-completely-different-domain.com.br'],
    })
    expect(token).toBeUndefined()
  })

  test('returns undefined for an empty recipient list', () => {
    const token = extractReplyToken({ replyDomain: REPLY_DOMAIN, toAddresses: [] })
    expect(token).toBeUndefined()
  })
})
