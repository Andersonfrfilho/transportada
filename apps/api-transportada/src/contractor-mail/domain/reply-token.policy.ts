/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHmac, randomBytes } from 'node:crypto'

/**
 * Correção pós-entrega da T009 (spec 143). RF2 manda guardar só o **hash** do token de resposta —
 * mas RF7 exige o **mesmo** `Reply-To` em toda a conversa, e um hash não se reverte. Um token
 * aleatório teria de ser persistido em claro para ser reaproveitado, o que o RF2 proíbe.
 *
 * A saída é **derivar** o token, sempre igual para a mesma conversa: `HMAC-SHA256(replyTokenSecret,
 * "transportada:contractor-mail-reply:v1:" + companyId + ":" + threadId)`, truncado a 128 bits. O
 * `replyTokenSecret` é selado no envelope da T006 (terceiro campo), nunca no banco em claro — e o
 * hash do token derivado continua sendo o que `contractor_mail_threads.reply_token_hash` guarda,
 * gravado uma vez, quando a conversa nasce.
 */
const REPLY_TOKEN_SECRET_BYTES = 32
const REPLY_TOKEN_BYTES = 16
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
const REPLY_TOKEN_AAD_PREFIX = 'transportada:contractor-mail-reply:v1'

/** 32 bytes aleatórios em hex minúsculo, gerados no servidor no primeiro `PUT` de configuração. */
export function generateReplyTokenSecret(): string {
  return randomBytes(REPLY_TOKEN_SECRET_BYTES).toString('hex')
}

/**
 * Determinístico: a mesma tripla `(replyTokenSecret, companyId, threadId)` sempre produz o mesmo
 * token — é isso que faz o RF7 funcionar sem persistir o token em claro em lugar nenhum.
 */
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

export function hashReplyToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex').toLowerCase()
}

export function buildReplyAddress(input: {
  readonly replyDomain: string
  readonly token: string
}): string {
  return `${input.token}@${input.replyDomain}`
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
