/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A data da tarifa impressa ao lado do total do pedágio (spec 090 T7). `observed_on` é a data do
 * extract, sempre `AAAA-MM-DD` — nunca passa por `Date`/fuso: meia-noite UTC de 1º de julho vira 30
 * de junho às 21h em Brasília, e a tela imprimiria o mês errado.
 */

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** `'2026-07-01'` vira `'julho/2026'`. Formato inesperado devolve a data crua, nunca quebra a tela. */
export function formatTariffMonth(observedOn: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/u.exec(observedOn)
  if (match === null) return observedOn

  const [, year, month] = match
  const monthIndex = Number(month) - 1
  const monthName = MONTH_NAMES[monthIndex]
  if (monthName === undefined) return observedOn

  return `${monthName}/${year}`
}
