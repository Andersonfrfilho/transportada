/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `api-transportada/src/expenses/domain/expense-schedule.policy.ts` (as apps não importam código
 * umas das outras). A paridade é cobrada por `test/company-expense-occurrence/schedule-parity.contract.ts`.
 *
 * Spec 325 RF1/RF4: a conta fixa gera uma janela de competências (mês corrente + 3); cada recorrência cai em alguns
 * meses e a quinzenal tem duas datas por mês (`slot` 1 = dia 15, `slot` 2 = último dia).
 */
export type ExpenseRecurrence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly' | 'fortnightly'

export const EXPENSE_GENERATION_WINDOW_MONTHS = 4
const FORTNIGHT_FIRST_DAY = 15
const MONTHS_BETWEEN: Readonly<Record<ExpenseRecurrence, number>> = {
  bimonthly: 2,
  fortnightly: 1,
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

export type ExpenseScheduleSlot = {
  readonly dueDate: string
  readonly slot: 1 | 2
}

function parseCompetence(competence: string): { readonly month: number; readonly year: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(competence)
  if (match === null) throw new Error(`competence must be yyyy-mm: ${competence}`)
  return { month: Number(match[2]), year: Number(match[1]) }
}

function formatCompetence(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function monthIndex(competence: string): number {
  const { month, year } = parseCompetence(competence)
  return year * 12 + (month - 1)
}

/** Devolve `yyyy-mm-dd`; mês curto cai no último dia. */
export function resolveExpenseDueDate(params: {
  readonly competence: string
  readonly dueDay: number
}): string {
  if (!Number.isInteger(params.dueDay) || params.dueDay < 1 || params.dueDay > 31) {
    throw new Error(`dueDay must be between 1 and 31: ${params.dueDay}`)
  }
  const { month, year } = parseCompetence(params.competence)
  const day = Math.min(params.dueDay, lastDayOfMonth(year, month))
  return `${params.competence}-${String(day).padStart(2, '0')}`
}

/** `yyyy-mm` de uma data civil `yyyy-mm-dd`. */
export function competenceOfDate(date: string): string {
  const match = /^(\d{4}-\d{2})-\d{2}$/.exec(date)
  if (match?.[1] === undefined) throw new Error(`date must be yyyy-mm-dd: ${date}`)
  parseCompetence(match[1])
  return match[1]
}

/** As competências a gerar: a do `today` e as `months - 1` seguintes. */
export function listExpenseCompetenceWindow(
  today: string,
  months = EXPENSE_GENERATION_WINDOW_MONTHS,
): readonly string[] {
  const { month, year } = parseCompetence(competenceOfDate(today))
  const start = year * 12 + (month - 1)
  return Array.from({ length: months }, (_, offset) => {
    const index = start + offset
    return formatCompetence(Math.floor(index / 12), (index % 12) + 1)
  })
}

/**
 * As datas que a recorrência pede numa competência (vazio quando o mês não é dela). `anchorCompetence` é o mês em
 * que a conta começou: bimestral/trimestral/anual contam a partir dele.
 */
export function resolveExpenseSlots(params: {
  readonly anchorCompetence: string
  readonly competence: string
  readonly dueDay: number | null
  readonly recurrence: ExpenseRecurrence
}): readonly ExpenseScheduleSlot[] {
  const distance = monthIndex(params.competence) - monthIndex(params.anchorCompetence)
  if (distance < 0 || distance % MONTHS_BETWEEN[params.recurrence] !== 0) return []
  if (params.recurrence === 'fortnightly') {
    return [
      {
        dueDate: resolveExpenseDueDate({
          competence: params.competence,
          dueDay: FORTNIGHT_FIRST_DAY,
        }),
        slot: 1,
      },
      { dueDate: resolveExpenseDueDate({ competence: params.competence, dueDay: 31 }), slot: 2 },
    ]
  }
  if (params.dueDay === null) throw new Error('dueDay is required for a non-fortnightly recurrence')
  return [
    {
      dueDate: resolveExpenseDueDate({ competence: params.competence, dueDay: params.dueDay }),
      slot: 1,
    },
  ]
}

/** A data civil de `America/Sao_Paulo` no instante dado (`yyyy-mm-dd`). */
export function civilDateInSaoPaulo(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
  }).format(instant)
}
