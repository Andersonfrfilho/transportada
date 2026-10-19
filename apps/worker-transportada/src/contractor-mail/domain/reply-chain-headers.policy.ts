/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Spec 274 D7: `References` leva os últimos 20 ids da linha. */
export const REPLY_CHAIN_MAX_REFERENCES = 20

export type ReplyChainHeaders = {
  readonly 'In-Reply-To': string
  readonly References: string
}

/** `abc@x` e `<abc@x>` são o mesmo id; o cabeçalho sai sempre com os colchetes. */
export function normalizeRfcMessageId(value: string): string {
  const trimmed = value.trim().replace(/^<+/, '').replace(/>+$/, '').trim()
  return trimmed === '' ? '' : `<${trimmed}>`
}

/**
 * Spec 274 D7: `rfcMessageIds` já vêm em ordem de criação (entrada e saída, sem encaminhamento). Sem id → sem
 * cabeçalho; `In-Reply-To` é o mais recente, `References` os últimos 20, sem repetir. O worker não gera `Message-ID`.
 */
export function buildReplyChainHeaders(
  rfcMessageIds: readonly string[],
): ReplyChainHeaders | undefined {
  const chain = [
    ...new Set(rfcMessageIds.map(normalizeRfcMessageId).filter((id) => id !== '')),
  ].slice(-REPLY_CHAIN_MAX_REFERENCES)
  const latest = chain.at(-1)
  if (latest === undefined) return undefined
  return { 'In-Reply-To': latest, References: chain.join(' ') }
}
