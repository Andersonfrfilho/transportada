/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T9: a nota falada no áudio, conferida na confirmação. O whisper erra número ("899804" no
 * lugar de "899877"), e o "Entendi assim" é a chance de pegar o erro antes de seguir: quando a fala
 * traz um número que bate com uma nota das viagens do motorista, a confirmação mostra a nota
 * (cliente, valor, endereço); quando não bate, avisa e lista as notas que estão com ele.
 */

/** O que a confirmação mostra de uma nota das viagens em aberto do motorista do grupo. */
export type SpokenNoteSummary = {
  readonly address: string
  /** A contratante (emitente) da nota; vazia quando não se sabe. */
  readonly contractor?: string
  readonly number: string
  readonly recipientName: string
  readonly series: string
  /** Decimal em texto, como sai do banco ("1234.5"); vazio sem valor. */
  readonly totalAmount: string
}

/** A nota das viagens do motorista (`GroupDriverDocument`) no formato da confirmação. */
export function toSpokenNoteSummary(document: {
  readonly address?: string
  readonly number: string
  readonly recipientName?: string
  readonly series?: string
  readonly totalAmount?: string
}): SpokenNoteSummary {
  return {
    address: document.address ?? '',
    number: document.number,
    recipientName: document.recipientName ?? '',
    series: document.series ?? '',
    totalAmount: document.totalAmount ?? '',
  }
}

/** Número de nota tem de 5 a 9 dígitos; menos que isso é opção de lista, quantidade ou dia. */
const NOTE_DIGITS = /^\d{5,9}$/u
const MAX_LISTED_NOTES = 5

const withoutLeadingZeros = (value: string) => value.replace(/^0+/u, '')

/** "1234.5" vira "R$ 1.234,50", sem passar por ponto flutuante. */
export function formatSpokenNoteAmount(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value.trim())
  if (match === null) return ''
  const [, sign = '', integer = '0', fraction = ''] = match
  const cents = `${fraction}00`.slice(0, 2)
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/gu, '.')
  return `${sign}R$ ${grouped},${cents}`
}

/** Os números de nota que a fala traz (já com os pares juntados por `joinSpokenNumbers`). */
/** A nota das viagens do motorista que a fala cita (para buscar só o que vai aparecer). */
export function isSpokenNote(note: { readonly number: string }, text: string): boolean {
  return spokenNoteNumbers(text).includes(withoutLeadingZeros(note.number))
}

export function spokenNoteNumbers(text: string): readonly string[] {
  return [
    ...new Set(
      (text.match(/\d+/gu) ?? [])
        .filter((token) => NOTE_DIGITS.test(token))
        .map(withoutLeadingZeros),
    ),
  ]
}

/** As linhas que entram no "Entendi assim", depois do texto; vazia quando a fala não traz nota. */
export function describeSpokenNotes(
  notes: readonly SpokenNoteSummary[],
  text: string,
): readonly string[] {
  const spoken = spokenNoteNumbers(text)
  if (spoken.length === 0) return []
  const lines: string[] = []
  for (const number of spoken) {
    const note = notes.find((candidate) => withoutLeadingZeros(candidate.number) === number)
    if (note === undefined) {
      lines.push(`⚠️ Não achei a NF *${number}* nas suas viagens em aberto.`)
      continue
    }
    const invoice = `🧾 NF \`${withoutLeadingZeros(note.number)}${note.series === '' ? '' : `/${note.series}`}\``
    lines.push(
      [
        note.recipientName === '' ? invoice : `${invoice} · *${note.recipientName}*`,
        ...(note.address === '' ? [] : [`📍 ${note.address}`]),
      ].join('\n'),
    )
  }
  const missing = lines.some((line) => line.startsWith('⚠️'))
  if (missing && notes.length > 0) {
    const listed = notes.slice(0, MAX_LISTED_NOTES).map((note) => withoutLeadingZeros(note.number))
    lines.push(`Notas com você: ${listed.join(', ')}${notes.length > MAX_LISTED_NOTES ? '…' : ''}`)
  }
  return lines
}
