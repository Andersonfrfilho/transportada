/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (RF2): o token da prévia é o local-part inteiro — 26 caracteres base32 minúsculos, num
 * espaço de hash que NÃO é o das conversas (um token de conversa nunca abre perfil de prévia). `+`
 * continua rejeitado, e só o hash é comparado.
 */
import { describe, expect, test } from 'bun:test'

import { hashReplyToken } from '../../src/contractor-mail/domain/reply-token.policy.js'
import {
  extractPreviewTokenCandidates,
  hashPreviewInboundToken,
} from '../../src/cargo-preview-email/domain/preview-inbound-token.policy.js'

const DOMAIN = 'entrada.example'
const TOKEN = 'previewtoken234567abcdefgh'

describe('o token do endereço de entrada da prévia (spec 237 T4.6)', () => {
  test('o token é o local-part inteiro, 26 base32 minúsculos, no domínio de entrada', () => {
    expect(TOKEN).toHaveLength(26)
    expect(
      extractPreviewTokenCandidates({ replyDomain: DOMAIN, toAddresses: [`${TOKEN}@${DOMAIN}`] }),
    ).toEqual([TOKEN])
    expect(
      extractPreviewTokenCandidates({
        ccAddresses: [`Equipe <${TOKEN.toUpperCase()}@${DOMAIN.toUpperCase()}>`],
        replyDomain: DOMAIN,
        toAddresses: ['alguem@outro.example'],
      }),
    ).toEqual([TOKEN])
  })

  test.each([
    ['sufixo com +', `${TOKEN}+x@${DOMAIN}`],
    ['prefixo com +', `previa+${TOKEN}@${DOMAIN}`],
    ['25 caracteres', `${TOKEN.slice(1)}@${DOMAIN}`],
    ['27 caracteres', `${TOKEN}a@${DOMAIN}`],
    ['caractere fora do base32', `${TOKEN.slice(0, 25)}1@${DOMAIN}`],
    ['outro domínio', `${TOKEN}@outro.example`],
    ['subdomínio', `${TOKEN}@x.${DOMAIN}`],
  ])('recusa %s', (_name, address) => {
    expect(extractPreviewTokenCandidates({ replyDomain: DOMAIN, toAddresses: [address] })).toEqual(
      [],
    )
  })

  test('o domínio de entrada configurado com espaço nas pontas ainda casa (como na API, que o apara)', () => {
    expect(
      extractPreviewTokenCandidates({
        replyDomain: `  ${DOMAIN.toUpperCase()} `,
        toAddresses: [`${TOKEN}@${DOMAIN}`],
      }),
    ).toEqual([TOKEN])
  })

  test('devolve cada candidato uma vez só', () => {
    expect(
      extractPreviewTokenCandidates({
        ccAddresses: [`${TOKEN}@${DOMAIN}`],
        replyDomain: DOMAIN,
        toAddresses: [`${TOKEN}@${DOMAIN}`],
      }),
    ).toEqual([TOKEN])
  })

  test('o hash é sha256 hex de 64 caracteres, determinístico e diferente do hash da conversa', () => {
    const hash = hashPreviewInboundToken(TOKEN)
    expect(hash).toMatch(/^[0-9a-f]{64}$/u)
    expect(hashPreviewInboundToken(TOKEN)).toBe(hash)
    expect(hash).not.toBe(hashReplyToken(TOKEN))
    expect(hashPreviewInboundToken(`${TOKEN.slice(0, 25)}a`)).not.toBe(hash)
  })
})
