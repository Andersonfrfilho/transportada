/* Copyright (c) 2026 Ada Technology. MIT License. */

/** `dd/mm/aaaa` sem as barras: no máximo oito dígitos. */
const DATE_DIGITS_LIMIT = 8

export type NewDueDateProblem = 'incomplete' | 'invalid' | 'past'

export type NewDueDateReading = Readonly<{
  /** `AAAA-MM-DD`, só quando a data está completa, existe e não é anterior a hoje. */
  iso: string | undefined
  problem: NewDueDateProblem | undefined
}>

function formatDigits(digits: string): string {
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  return [day, month, year].filter((part) => part !== '').join('/')
}

/** Só números: tudo que não é dígito sai, e as barras entram sozinhas (`25112026` vira `25/11/2026`). */
export function maskDateInput(text: string): string {
  return formatDigits(text.replace(/\D/gu, '').slice(0, DATE_DIGITS_LIMIT))
}

function toLocalIsoDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Lê o texto digitado. Vazio é "não informada" (o campo é opcional) e não é problema; a data pela metade, que não existe
 * (31/02) ou que já passou é problema — o campo guarda o texto e o botão avisa, nada é descartado em silêncio.
 */
export function readNewDueDate(input: {
  readonly now: Date
  readonly text: string
}): NewDueDateReading {
  const { now, text } = input
  if (text === '') return { iso: undefined, problem: undefined }
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(text)
  if (match === null) return { iso: undefined, problem: 'incomplete' }
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const parsed = new Date(Date.UTC(year, month - 1, day))
  const exists =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  if (!exists) return { iso: undefined, problem: 'invalid' }
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  if (iso < toLocalIsoDay(now)) return { iso: undefined, problem: 'past' }
  return { iso, problem: undefined }
}
