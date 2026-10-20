/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A resposta da contratante entra na conversa só com o texto novo. Os clientes de e-mail anexam o
 * histórico embaixo da resposta — o Gmail com "Em …, Fulano <…> escreveu:" (quebrado em até três
 * linhas), o Outlook com o bloco "De:/Enviada em:" — e sem o corte cada mensagem repetiria a conversa
 * inteira. O MIME bruto continua no bucket; aqui só se escolhe o que aparece.
 *
 * Nada novo acima da citação (a pessoa respondeu dentro do texto citado) devolve o texto inteiro:
 * cortar demais esconde a resposta, cortar de menos só repete o histórico.
 */
const ATTRIBUTION_START = /^(em|on|le|el)\s+\S/iu
const ATTRIBUTION_END = /(escreveu|wrote|a écrit|escribió)\s*:\s*$/iu
const ATTRIBUTION_MAX_LINES = 3
const OUTLOOK_FROM = /^(de|from)\s*:\s*\S/iu
const OUTLOOK_SENT = /^(enviad[ao](\s+em)?|sent|data|date)\s*:\s*\S/iu
const ORIGINAL_MESSAGE_SEPARATOR = /^-{2,}\s*(original message|mensagem original)\s*-{2,}\s*$/iu
const QUOTED_LINE = /^\s*>/u

export function extractReplyText(text: string): string {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n')
  const cutAt = findHistoryStart(lines)
  const reply = trimTrailingQuote(lines.slice(0, cutAt)).join('\n').trim()
  return reply === '' ? text : reply
}

function findHistoryStart(lines: readonly string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim()
    if (ORIGINAL_MESSAGE_SEPARATOR.test(line)) return index
    if (isOutlookHeader(lines, index)) return index
    if (isAttribution(lines, index)) return index
  }
  return lines.length
}

function isAttribution(lines: readonly string[], index: number): boolean {
  if (!ATTRIBUTION_START.test(lines[index]!.trim())) return false
  for (let size = 1; size <= ATTRIBUTION_MAX_LINES; size += 1) {
    const candidate = lines
      .slice(index, index + size)
      .map((line) => line.trim())
      .join(' ')
    if (ATTRIBUTION_END.test(candidate)) return true
  }
  return false
}

function isOutlookHeader(lines: readonly string[], index: number): boolean {
  if (!OUTLOOK_FROM.test(lines[index]!.trim())) return false
  const next = lines[index + 1]?.trim() ?? ''
  return OUTLOOK_SENT.test(next)
}

function trimTrailingQuote(lines: readonly string[]): readonly string[] {
  let end = lines.length
  while (end > 0 && (lines[end - 1]!.trim() === '' || QUOTED_LINE.test(lines[end - 1]!))) end -= 1
  return lines.slice(0, end)
}
