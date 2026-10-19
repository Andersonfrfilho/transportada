/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §4, D4): a parte `text/plain` gerada do HTML renderizado. Sem biblioteca. Pura.
 */
const COMMENT_REGEX = /<!--[\s\S]*?-->/gu
const DROPPED_ELEMENT_REGEX = /<(head|style|title)\b[^>]*>[\s\S]*?<\/\1\s*>/giu
const LINE_BREAK_REGEX = /<br\b[^>]*>|<\/(?:p|div|tr|li|h[1-6]|table)\s*>/giu
const CELL_END_REGEX = /<\/(?:td|th)\s*>/giu
const TAG_REGEX = /<\/?[a-zA-Z][^>]*>/gu
const ENTITY_REGEX = /&(?:#x([0-9a-f]+)|#([0-9]+)|(amp|lt|gt|quot|apos|nbsp));/giu
const NAMED_ENTITY: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}
const MAX_CODE_POINT = 0x10ffff
const HORIZONTAL_SPACE_RUN = /[^\S\n]+/gu
const BLANK_LINE_RUN = /\n{3,}/gu

/** Uma passada só: cada entidade é decodificada uma vez, então `&amp;lt;` vira `&lt;`, nunca `<`. */
function decodeEntities(text: string): string {
  return text.replace(
    ENTITY_REGEX,
    (_entity, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (named !== undefined) return NAMED_ENTITY[named.toLowerCase()] ?? ''
      const code = hex === undefined ? Number.parseInt(decimal ?? '', 10) : Number.parseInt(hex, 16)
      return Number.isFinite(code) && code <= MAX_CODE_POINT ? String.fromCodePoint(code) : ''
    },
  )
}

export function htmlToPlainText(html: string): string {
  const withoutNoise = html.replace(COMMENT_REGEX, '').replace(DROPPED_ELEMENT_REGEX, '')
  const withBreaks = withoutNoise
    .replace(LINE_BREAK_REGEX, '\n')
    .replace(CELL_END_REGEX, ' ')
    .replace(TAG_REGEX, '')
  return decodeEntities(withBreaks)
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.replace(HORIZONTAL_SPACE_RUN, ' ').trim())
    .join('\n')
    .replace(BLANK_LINE_RUN, '\n\n')
    .trim()
}
