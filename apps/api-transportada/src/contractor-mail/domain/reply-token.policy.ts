/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { randomBytes } from 'node:crypto'

/**
 * Spec 143 T009 (RF2). Só o que a T009 precisa: gerar o token, o hash e o endereço de resposta. A
 * T014 completa este arquivo com o que faltar para a decisão por e-mail (P2).
 *
 * 128 bits em base32 minúsculo (RFC 4648, sem padding): o local-part de um e-mail não distingue
 * caixa na prática, e maiúsculas exigiriam o operador digitar exatamente como veio ao citar o
 * endereço à mão. O banco guarda só o hash — `hashReplyToken` usa o mesmo `Bun.CryptoHasher` que
 * `invitation.policy.ts` já usa para o convite, em hex minúsculo, batendo com o CHECK
 * `contractor_mail_threads_reply_token_hash_check` (`^[0-9a-f]{64}$`).
 */
const REPLY_TOKEN_BYTES = 16
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

export type GeneratedReplyToken = {
  readonly token: string
  readonly tokenHash: string
}

export function generateReplyToken(): GeneratedReplyToken {
  const token = encodeBase32Lowercase(randomBytes(REPLY_TOKEN_BYTES))
  return { token, tokenHash: hashReplyToken(token) }
}

export function hashReplyToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex').toLowerCase()
}

export function buildReplyAddress(input: {
  readonly replyDomain: string
  readonly token: string
}): string {
  return `${input.token}@${input.replyDomain}`
}

function encodeBase32Lowercase(buffer: Buffer): string {
  let bitBuffer = 0
  let bitCount = 0
  let output = ''

  for (const byte of buffer) {
    bitBuffer = (bitBuffer << 8) | byte
    bitCount += 8

    while (bitCount >= 5) {
      const index = (bitBuffer >>> (bitCount - 5)) & 0b11111
      output += BASE32_ALPHABET[index]
      bitCount -= 5
    }
  }

  if (bitCount > 0) {
    const index = (bitBuffer << (5 - bitCount)) & 0b11111
    output += BASE32_ALPHABET[index]
  }

  return output
}
