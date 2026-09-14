/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor de `api-transportada/src/contractor-mail/domain/reply-token.policy.ts` — as duas
 * apps não importam código uma da outra. O worker só **deriva** e **monta o endereço**; quem gera o
 * `replyTokenSecret` e grava o hash é a API. `test/contractor-mail/reply-token-parity.contract.ts`
 * guarda a fórmula igual dos dois lados.
 *
 * Correção pós-entrega da T009 (spec 143): o e-mail de saída não carrega mais `Reply-To` na fila —
 * o worker recalcula `<token>@<replyDomain>` a partir da própria configuração (`replyTokenSecret`,
 * `companyId`, `threadId` da mensagem), sem ler token nem endereço do banco nem do envelope.
 */
import { createHmac } from 'node:crypto'

const REPLY_TOKEN_BYTES = 16
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const REPLY_TOKEN_AAD_PREFIX = 'transportada:contractor-mail-reply:v1'

export function deriveReplyToken(input: {
  readonly companyId: string
  readonly replyTokenSecret: string
  readonly threadId: string
}): string {
  const digest = createHmac('sha256', Buffer.from(input.replyTokenSecret, 'hex'))
    .update(`${REPLY_TOKEN_AAD_PREFIX}:${input.companyId}:${input.threadId}`)
    .digest()

  return encodeBase32Lowercase(digest.subarray(0, REPLY_TOKEN_BYTES))
}

export function buildReplyAddress(input: {
  readonly replyDomain: string
  readonly token: string
}): string {
  return `${input.token}@${input.replyDomain}`
}

/**
 * T010: o trilho de entrada extrai o token do local-part do destinatário e precisa do mesmo hash
 * que a API grava em `contractor_mail_threads.reply_token_hash`, para achar a conversa.
 */
export function hashReplyToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex').toLowerCase()
}

function encodeBase32Lowercase(buffer: Uint8Array): string {
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
