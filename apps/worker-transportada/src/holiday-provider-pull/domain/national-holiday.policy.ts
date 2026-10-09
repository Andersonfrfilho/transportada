/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor, só das datas,** de `api-transportada/src/business-calendar/domain/national-holiday.policy.ts`
 * (spec 238 RF2: o feriado nacional é lei e mora no código). Serve só à paridade com o que o fornecedor
 * lista (D4): a rotina conta a diferença, nunca grava feriado nacional. O contrato
 * `test/holiday-provider-pull/apply.contract.ts` compara as duas listas ano a ano de 2000 a 2100.
 */
const MILLISECONDS_PER_DAY = 86_400_000

type CivilDateParts = { readonly day: number; readonly month: number; readonly year: number }

/** A mesma lista do painel e da API: Consciência Negra entra em todo ano, por paridade. */
const FIXED_NATIONAL_HOLIDAYS = [
  { day: 1, month: 1 },
  { day: 21, month: 4 },
  { day: 1, month: 5 },
  { day: 7, month: 9 },
  { day: 12, month: 10 },
  { day: 2, month: 11 },
  { day: 15, month: 11 },
  { day: 20, month: 11 },
  { day: 25, month: 12 },
] as const

/** Carnaval (segunda e terça) e Corpus Christi como feriado: decisão da spec 238; mais a Sexta-feira Santa. */
const EASTER_RELATIVE_OFFSET_DAYS = [-48, -47, -2, 60] as const

function formatCivilDate({ day, month, year }: CivilDateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dayNumberOf({ day, month, year }: CivilDateParts): number {
  return Date.UTC(year, month - 1, day) / MILLISECONDS_PER_DAY
}

function fromDayNumber(dayNumber: number): string {
  const instant = new Date(dayNumber * MILLISECONDS_PER_DAY)
  return formatCivilDate({
    day: instant.getUTCDate(),
    month: instant.getUTCMonth() + 1,
    year: instant.getUTCFullYear(),
  })
}

/** Algoritmo de Meeus/Jones/Butcher para o domingo de Páscoa no calendário gregoriano. */
function resolveEasterDayNumber(year: number): number {
  const goldenNumber = year % 19
  const century = Math.floor(year / 100)
  const yearOfCentury = year % 100
  const centuryLeapQuotient = Math.floor(century / 4)
  const centuryLeapRemainder = century % 4
  const lunarCorrection = Math.floor((century + 8) / 25)
  const solarCorrection = Math.floor((century - lunarCorrection + 1) / 3)
  const epact = (19 * goldenNumber + century - centuryLeapQuotient - solarCorrection + 15) % 30
  const yearLeapQuotient = Math.floor(yearOfCentury / 4)
  const yearLeapRemainder = yearOfCentury % 4
  const weekdayOffset =
    (32 + 2 * centuryLeapRemainder + 2 * yearLeapQuotient - epact - yearLeapRemainder) % 7
  const paschalCorrection = Math.floor((goldenNumber + 11 * epact + 22 * weekdayOffset) / 451)
  const monthAndDay = epact + weekdayOffset - 7 * paschalCorrection + 114

  return dayNumberOf({ day: (monthAndDay % 31) + 1, month: Math.floor(monthAndDay / 31), year })
}

/** As datas (`AAAA-MM-DD`) dos feriados nacionais do ano, em ordem. */
export function listNationalHolidayDates(year: number): readonly string[] {
  const easterDayNumber = resolveEasterDayNumber(year)
  const dates = [
    ...FIXED_NATIONAL_HOLIDAYS.map(({ day, month }) => formatCivilDate({ day, month, year })),
    ...EASTER_RELATIVE_OFFSET_DAYS.map((offset) => fromDayNumber(easterDayNumber + offset)),
  ]

  return dates.toSorted((left, right) => left.localeCompare(right))
}
