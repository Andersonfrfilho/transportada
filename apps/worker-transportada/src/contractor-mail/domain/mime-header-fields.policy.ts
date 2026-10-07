/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7c: lê o cabeçalho do MIME em campos pela MESMA regra da `mailauth` (`parseHeaders`): a linha que
 * não abre um campo (`nome` sem espaços e `:`, com a dobra permitida entre os dois) soma no campo de cima, e o
 * nome é o trecho antes do primeiro `:` sem espaços. Medir por outra regra deixa passar `Return-Path : …`, o nome
 * dobrado antes do `:` e as linhas sem `:` ou iniciadas por NBSP, que o verificador junta ao mesmo campo.
 */
const FIELD_START = /^[\x21-\x39\x3b-\x7e]+[ \t\r\n]*:/u
const NAME_EDGE_WHITESPACE = /^[ \t]+|[ \t]+$/gu
const LINE_BREAK_CHARACTERS = /[\r\n]/gu
const FOLD = '\r\n'

export type MimeHeaderField = {
  readonly bytes: number
  readonly name: string
}

export function readMimeHeaderFields(lines: readonly string[]): readonly MimeHeaderField[] {
  const startsField = markFieldStarts(lines)
  const fields: MimeHeaderField[] = []
  let first = 0
  for (let index = 1; index <= lines.length; index += 1) {
    if (index < lines.length && startsField[index] !== true) continue
    fields.push(buildField(lines, first, index))
    first = index
  }
  return fields
}

/** Do fim para o começo, como a `mailauth`: a linha só abre campo olhando a seguinte quando esta foi absorvida. */
function markFieldStarts(lines: readonly string[]): boolean[] {
  const startsField = lines.map(() => true)
  const last = lines.length - 1
  if (last > 0) startsField[last] = FIELD_START.test(lines[last] ?? '')
  for (let index = last - 1; index > 0; index -= 1) {
    const isNextAbsorbed = startsField[index + 1] === false
    const head = isNextAbsorbed ? `${lines[index]}${FOLD}${lines[index + 1]}` : lines[index]
    startsField[index] = FIELD_START.test(head ?? '')
  }
  return startsField
}

function buildField(lines: readonly string[], first: number, end: number): MimeHeaderField {
  let bytes = 0
  for (let index = first; index < end; index += 1) bytes += lines[index]?.length ?? 0
  const head = lines.slice(first, Math.min(end, first + 2)).join(FOLD)
  const colon = head.indexOf(':')
  const rawName = colon < 0 ? head : head.slice(0, colon)
  const name = rawName
    .replace(LINE_BREAK_CHARACTERS, '')
    .replace(NAME_EDGE_WHITESPACE, '')
    .toLowerCase()
  return { bytes, name }
}
