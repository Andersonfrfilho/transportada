/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §7/§8): as duas operações de linha única do assunto e do "De" — colapsar e cortar. Puras.
 */
const WHITESPACE_RUN = /\s+/gu

/** Uma linha só: toda sequência de espaço e quebra vira um espaço; pontas fora (o saneamento do assunto, 269). */
export function collapseLine(text: string): string {
  return text.replace(WHITESPACE_RUN, ' ').trim()
}

/**
 * Corta em `maxLength` unidades UTF-16 (o `length` do CHECK e do teto do assunto) sem partir um par substituto: um
 * substituto solto é UTF-8 inválido e derrubaria a gravação.
 */
export function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0) return ''
  if (text.length <= maxLength) return text
  let result = ''
  for (const character of text) {
    if (result.length + character.length > maxLength) break
    result += character
  }
  return result
}
