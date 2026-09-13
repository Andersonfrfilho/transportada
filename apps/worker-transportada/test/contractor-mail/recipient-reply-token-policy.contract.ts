/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { extractReplyTokenCandidates } from '../../src/contractor-mail/domain/recipient-reply-token.policy.js'

const REPLY_DOMAIN = 'resposta.fernandes-transportadora.com.br'
/** 128 bits em base32 minúsculo sem padding: 26 caracteres — o mesmo formato do token derivado. */
const TOKEN_A = 'abcdefghijklmnopqrstuvwxyz'
const TOKEN_B = 'bbcdefghijklmnopqrstuvwxyz'

describe('recipient reply token policy (spec 143, T010 — revisão do architect)', () => {
  test('extracts the local-part of the address matching the reply domain', () => {
    const candidates = extractReplyTokenCandidates({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`${TOKEN_A}@${REPLY_DOMAIN}`],
    })
    expect(candidates).toEqual([TOKEN_A])
  })

  test('extracts the token from a "Name <address>" formatted recipient', () => {
    const candidates = extractReplyTokenCandidates({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`Ocorrências <${TOKEN_A}@${REPLY_DOMAIN}>`],
    })
    expect(candidates).toEqual([TOKEN_A])
  })

  test('matches the domain case-insensitively, and lowercases the local-part', () => {
    const candidates = extractReplyTokenCandidates({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`${TOKEN_A.toUpperCase()}@${REPLY_DOMAIN.toUpperCase()}`],
    })
    expect(candidates).toEqual([TOKEN_A])
  })

  /** Duas conversas concorrendo pelo mesmo e-mail: os dois candidatos voltam, e quem decide é o caso de uso. */
  test('returns both candidates when two addresses of the domain are present', () => {
    const candidates = extractReplyTokenCandidates({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`${TOKEN_A}@${REPLY_DOMAIN}`, `${TOKEN_B}@${REPLY_DOMAIN}`],
    })
    expect([...candidates].sort()).toEqual([TOKEN_A, TOKEN_B].sort())
  })

  test('extracts a token that only appears in cc ("reply all")', () => {
    const candidates = extractReplyTokenCandidates({
      ccAddresses: [`${TOKEN_A}@${REPLY_DOMAIN}`],
      replyDomain: REPLY_DOMAIN,
      toAddresses: ['someone-else@example.com'],
    })
    expect(candidates).toEqual([TOKEN_A])
  })

  /** Alias do Gmail (`+sufixo`): o local-part inteiro deixa de bater no formato base32 de 26 caracteres. */
  test('discards a "+suffix" alias even when the domain matches', () => {
    const candidates = extractReplyTokenCandidates({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`${TOKEN_A}+x@${REPLY_DOMAIN}`],
    })
    expect(candidates).toEqual([])
  })

  test('does not match a similar-looking domain', () => {
    const candidates = extractReplyTokenCandidates({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`${TOKEN_A}@resposta.outro.com`],
    })
    expect(candidates).toEqual([])
  })

  test('discards garbage that happens to land on the right domain', () => {
    const candidates = extractReplyTokenCandidates({
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`nao-e-um-token@${REPLY_DOMAIN}`, `curto@${REPLY_DOMAIN}`],
    })
    expect(candidates).toEqual([])
  })

  test('returns no duplicates when the same candidate appears in to and cc', () => {
    const candidates = extractReplyTokenCandidates({
      ccAddresses: [`${TOKEN_A}@${REPLY_DOMAIN}`],
      replyDomain: REPLY_DOMAIN,
      toAddresses: [`${TOKEN_A}@${REPLY_DOMAIN}`],
    })
    expect(candidates).toEqual([TOKEN_A])
  })

  test('returns no candidates for an empty recipient list', () => {
    const candidates = extractReplyTokenCandidates({ replyDomain: REPLY_DOMAIN, toAddresses: [] })
    expect(candidates).toEqual([])
  })
})
