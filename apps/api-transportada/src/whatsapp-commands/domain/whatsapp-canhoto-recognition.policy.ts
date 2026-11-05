/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8 (RF23, ADR 0113 §5): **o que o bot faz com a foto depois que o worker a leu.** O número da nota é a prova
 * principal; as marcas do canhoto ("Recebemos de", data de recebimento, assinatura) são a secundária; marca única nunca
 * decide. Nunca baixa por palpite: só o casamento exato com uma única nota segue sem perguntar.
 */
import { DRIVER_CHOICE, interpretDriverChoice } from './whatsapp-driver-choice.policy.js'
import { normalizeDriverCommandText } from './whatsapp-driver-command.policy.js'

export type CanhotoReadVerdict = {
  readonly ambiguous: boolean
  readonly candidates: readonly { readonly documentId: string; readonly match: 'exact' | 'near' }[]
  readonly markers: number
}

/** Marcas que bastam para dizer "é um canhoto" sem número legível. */
export const CANHOTO_MIN_MARKERS = 2

export type OpenNote = {
  readonly documentId: string
  readonly documentNumber: string
  readonly label: string
}

export type CanhotoRecognitionDecision =
  | { readonly kind: 'attach'; readonly note: OpenNote }
  | { readonly kind: 'confirm_note'; readonly notes: readonly [OpenNote] }
  | { readonly kind: 'choose_note'; readonly notes: readonly OpenNote[] }
  | { readonly kind: 'photo_kind' }

/** `verdict` ausente: o leitor falhou (fila cheia, prazo). Vira a pergunta aberta, nunca baixa. */
export function decideCanhotoRecognition(input: {
  readonly notes: readonly OpenNote[]
  readonly verdict: CanhotoReadVerdict | undefined
}): CanhotoRecognitionDecision {
  const { notes, verdict } = input
  if (verdict === undefined) return { kind: 'photo_kind' }
  const matched = verdict.candidates.flatMap((candidate) => {
    const note = notes.find((item) => item.documentId === candidate.documentId)
    return note === undefined ? [] : [{ match: candidate.match, note }]
  })
  const [only] = matched
  if (only !== undefined && matched.length === 1 && !verdict.ambiguous) {
    return only.match === 'exact'
      ? { kind: 'attach', note: only.note }
      : { kind: 'confirm_note', notes: [only.note] }
  }
  if (matched.length > 0) return { kind: 'choose_note', notes: matched.map((item) => item.note) }
  return verdict.markers >= CANHOTO_MIN_MARKERS
    ? { kind: 'choose_note', notes }
    : { kind: 'photo_kind' }
}

export type CanhotoAnswer =
  | { readonly kind: 'discard' }
  | { readonly kind: 'not_understood' }
  | { readonly kind: 'note'; readonly note: OpenNote }
  | { readonly kind: 'yes' }
  | { readonly kind: 'no' }
  | { readonly kind: 'cargo' }
  | { readonly kind: 'canhoto' }

const stripZeros = (value: string): string => value.replace(/^0+(?=\d)/u, '')
const DISCARD_WORDS = new Set([
  'descartar',
  'descarta',
  'nenhuma',
  'nenhum',
  'cancelar',
  'cancela',
  'engano',
])

/** "1" / "sim" / "um" respondem ao 1/2; o 3 e "descartar" descartam. */
export function interpretConfirmAnswer(text: string): CanhotoAnswer {
  const choice = interpretDriverChoice(text)
  if (choice === DRIVER_CHOICE.first) return { kind: 'yes' }
  if (choice === DRIVER_CHOICE.second) return { kind: 'no' }
  return { kind: 'not_understood' }
}

/** O número da opção, ou o número da nota dito/escrito, ou "descartar". */
export function interpretChooseAnswer(text: string, notes: readonly OpenNote[]): CanhotoAnswer {
  const normalized = normalizeDriverCommandText(text)
  if (normalized.split(' ').some((word) => DISCARD_WORDS.has(word))) return { kind: 'discard' }
  const digits = normalized.replace(/\D/gu, '')
  if (digits === '') {
    return interpretDriverChoice(text) === DRIVER_CHOICE.skip
      ? { kind: 'discard' }
      : { kind: 'not_understood' }
  }
  if (/^\d{1,2}$/u.test(normalized.replace(/\s/gu, ''))) {
    const index = Number(digits)
    if (index === notes.length + 1 || index === 0) return { kind: 'discard' }
    const byOption = notes[index - 1]
    if (byOption !== undefined) return { kind: 'note', note: byOption }
  }
  const byNumber = notes.find((note) => stripZeros(note.documentNumber) === stripZeros(digits))
  return byNumber === undefined ? { kind: 'not_understood' } : { kind: 'note', note: byNumber }
}

/** O 1/2/3 do "não parece um canhoto": mercadoria, é o canhoto, descartar. */
export function interpretPhotoKindAnswer(text: string): CanhotoAnswer {
  const words = normalizeDriverCommandText(text).split(' ')
  if (words.some((word) => DISCARD_WORDS.has(word)) || words.join('') === '3')
    return { kind: 'discard' }
  if (words.join('') === '1' || words.includes('mercadoria') || words.includes('carga'))
    return { kind: 'cargo' }
  if (words.join('') === '2' || words.includes('canhoto')) return { kind: 'canhoto' }
  return { kind: 'not_understood' }
}
