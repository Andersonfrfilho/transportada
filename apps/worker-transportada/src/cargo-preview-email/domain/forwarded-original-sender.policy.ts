/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (D6): o remetente original do contratante é lido do que o ENCAMINHADOR entrega — o
 * cabeçalho da mensagem anexada ou o bloco encaminhado do texto. É informação, nunca autenticação: o
 * DKIM do contratante se perde no encaminhamento. Por isso nada é adivinhado — cabeçalho duplicado,
 * lista de endereços ou mais de um `From` no bloco viram `ambiguous`, e ausência vira `missing`.
 *
 * T4.7a: percorre os marcadores de encaminhamento até achar um bloco com `From`/`De` (a assinatura com
 * `_____` antes do bloco não esconde o remetente) e desdobra o cabeçalho dobrado em duas linhas.
 */
import { FORWARDED_BLOCK_LIMITS } from './cargo-preview-email.constant.js'
import { readSingleMailboxAddress } from './mailbox-address.policy.js'

export type OriginalSenderResult =
  | { readonly address: string; readonly kind: 'found' }
  | { readonly kind: 'ambiguous' }
  | { readonly kind: 'missing' }

export type MimeHeader = { readonly key: string; readonly value: string }

const FORWARD_MARKER =
  /^[\s>]*(?:-{2,}\s*(?:forwarded message|mensagem encaminhada|original message|mensagem original)\s*-{2,}|begin forwarded message:?|in[ií]cio da mensagem encaminhada:?|_{5,})\s*$/iu
const QUOTE_PREFIX = /^(?:>[ \t]?)+/u
const FROM_LINE = /^\s*(?:from|de)\s*:\s*(.*)$/iu
const FOLDED_LINE = /^[ \t]/u
const MISSING: OriginalSenderResult = { kind: 'missing' }
const AMBIGUOUS: OriginalSenderResult = { kind: 'ambiguous' }

export function readOriginalSenderFromHeaders(
  headers: readonly MimeHeader[],
): OriginalSenderResult {
  const fromHeaders = headers.filter((header) => header.key.toLowerCase() === 'from')
  if (fromHeaders.length === 0) return MISSING
  if (fromHeaders.length > 1) return AMBIGUOUS
  return resolveAddress(fromHeaders[0]?.value ?? '')
}

export function readOriginalSenderFromForwardedText(
  text: string | undefined,
): OriginalSenderResult {
  const lines = (text ?? '').split(/\r?\n/u).slice(0, FORWARDED_BLOCK_LIMITS.maxScanLines)
  for (const [index, line] of lines.entries()) {
    if (!FORWARD_MARKER.test(line)) continue
    const fromValues = readHeaderBlock(lines.slice(index + 1))
    if (fromValues.length === 0) continue
    if (fromValues.length > 1) return AMBIGUOUS
    return resolveAddress(fromValues[0] ?? '')
  }
  return MISSING
}

/** O cabeçalho do bloco é curto e termina na primeira linha vazia depois de começar; dobras se juntam. */
function readHeaderBlock(lines: readonly string[]): readonly string[] {
  const fromValues: string[] = []
  let headerLines = 0
  let current: string | undefined
  const flush = () => {
    if (current !== undefined) fromValues.push(current)
    current = undefined
  }
  for (const line of lines) {
    const content = line.replace(QUOTE_PREFIX, '')
    if (content.trim().length === 0) {
      if (headerLines > 0) break
      continue
    }
    if (headerLines > 0 && FOLDED_LINE.test(content)) {
      if (current !== undefined) current = `${current} ${content.trim()}`
      continue
    }
    flush()
    headerLines += 1
    if (headerLines > FORWARDED_BLOCK_LIMITS.maxHeaderLines) break
    current = FROM_LINE.exec(content)?.[1]
  }
  flush()
  return fromValues
}

function resolveAddress(value: string): OriginalSenderResult {
  const trimmed = value.trim()
  if (trimmed.length === 0) return MISSING
  const address = readSingleMailboxAddress(trimmed)
  if (address !== undefined) return { address, kind: 'found' }
  return /[,;]|@.*@/u.test(trimmed) ? AMBIGUOUS : MISSING
}
