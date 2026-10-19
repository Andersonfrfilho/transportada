/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Spec 274 D7: `References` leva os últimos 20 ids da linha. */
export const REPLY_CHAIN_MAX_REFERENCES = 20

export type ReplyChainHeaders = {
  readonly 'In-Reply-To': string
  readonly References: string
}

/** Uma linha de cabeçalho cabe em 998 bytes (RFC 5322 §2.1.1); `References` guarda o que couber, dos mais recentes. */
export const REPLY_CHAIN_MAX_REFERENCES_BYTES = 998

/**
 * Spec 274 (segurança M2): o id vem de e-mail externo e vai para um cabeçalho. Sem espaço, quebra de linha nem colchete
 * interno, e no máximo 255 entre os `<>` — senão injetaria cabeçalho ou quebraria a linha de `References`.
 */
const RFC_MESSAGE_ID_REGEX = /^<[^\s<>\r\n]{1,255}>$/u

/** `abc@x` e `<abc@x>` são o mesmo id; o cabeçalho sai sempre com os colchetes. */
export function normalizeRfcMessageId(value: string): string {
  const trimmed = value.trim().replace(/^<+/, '').replace(/>+$/, '').trim()
  return trimmed === '' ? '' : `<${trimmed}>`
}

/** O id normalizado, ou `undefined` quando não é um `Message-ID` seguro para o cabeçalho. */
export function parseRfcMessageId(value: string): string | undefined {
  const normalized = normalizeRfcMessageId(value)
  return RFC_MESSAGE_ID_REGEX.test(normalized) ? normalized : undefined
}

/**
 * Spec 274 D7: `rfcMessageIds` já vêm em ordem de criação (entrada e saída, sem encaminhamento). Sem id → sem
 * cabeçalho; `In-Reply-To` é o mais recente, `References` os últimos 20, sem repetir. O worker não gera `Message-ID`.
 */
export function buildReplyChainHeaders(
  rfcMessageIds: readonly string[],
): ReplyChainHeaders | undefined {
  const chain = [...new Set(rfcMessageIds.flatMap((id) => parseRfcMessageId(id) ?? []))].slice(
    -REPLY_CHAIN_MAX_REFERENCES,
  )
  while (
    chain.length > 1 &&
    Buffer.byteLength(chain.join(' ')) > REPLY_CHAIN_MAX_REFERENCES_BYTES
  ) {
    chain.shift()
  }
  const latest = chain.at(-1)
  if (latest === undefined) return undefined
  return { 'In-Reply-To': latest, References: chain.join(' ') }
}
