/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §8, D8): a API grava `contractor_mail_messages.from_display_name` já saneado; o worker reaplica o
 * mesmo saneamento antes de pôr o nome num cabeçalho (defesa em profundidade). Cópia por valor de
 * `occurrence-mail-sender-name.policy.ts` da API, presa pela tabela de casos copiada em `test/fixtures`.
 */
export const SENDER_DISPLAY_NAME_MAX = 200

/** Controle (inclui `\r`, `\n`, `\t`, DEL, C1) e U+2028/2029: viram espaço. */
const LINE_CONTROL_REGEX = /[\p{Cc}\u{2028}\u{2029}]/gu
/** Formatação/invisíveis (`\p{Cf}`: bidi, largura zero, U+2060, U+00AD, U+180E, tags, BOM) e `<>"\,;`: saem. */
const STRIPPED_REGEX = /[\p{Cf}<>"\\,;]/gu
const WHITESPACE_RUN = /\s+/gu

/** Vazio quando nada sobra: quem chama volta ao comportamento de antes (sem nome de exibição). */
export function sanitizeSenderDisplayName(value: string): string {
  const collapsed = value
    .replace(LINE_CONTROL_REGEX, ' ')
    .replace(STRIPPED_REGEX, '')
    .replace(WHITESPACE_RUN, ' ')
    .trim()
  if (collapsed.length <= SENDER_DISPLAY_NAME_MAX) return collapsed
  let result = ''
  for (const character of collapsed) {
    if (result.length + character.length > SENDER_DISPLAY_NAME_MAX) break
    result += character
  }
  return result.trimEnd()
}
