/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** `HH:MM` ou `HH:MM:SS` — é o que o Postgres devolve de uma coluna `time`. */
export type DeliveryWindowInterval = {
  readonly closesAt: string
  readonly opensAt: string
}

export type DeliveryWeeklyWindow = DeliveryWindowInterval & {
  /** 0 domingo … 6 sábado — a numeração de `EXTRACT(dow)`, a mesma da coluna. */
  readonly weekday: number
}

export type DeliveryDateException = {
  readonly closesAt: string | null
  readonly exceptionOn: string
  readonly kind: 'closed' | 'open'
  readonly opensAt: string | null
}

export type MunicipalHoliday = {
  readonly holidayOn: string
}

/**
 * De onde a resposta veio. Quem chama precisa disso para dizer ao operador **por que** o cliente está
 * fechado — "hoje é feriado em Sertãozinho" e "esse cliente não recebe às quartas" mandam a pessoa
 * para lugares diferentes.
 */
export const DELIVERY_WINDOW_SOURCES = ['exception', 'holiday', 'weekly', 'unset'] as const
export type DeliveryWindowSource = (typeof DELIVERY_WINDOW_SOURCES)[number]

export type ResolvedDeliveryWindow = {
  readonly intervals: readonly DeliveryWindowInterval[]
  readonly source: DeliveryWindowSource
}

export type ResolveDeliveryWindowParams = {
  /** `YYYY-MM-DD` no fuso da empresa. A conversão é de quem chama; esta política é pura. */
  readonly date: string
  readonly exceptions: readonly DeliveryDateException[]
  readonly holidays: readonly MunicipalHoliday[]
  readonly windows: readonly DeliveryWeeklyWindow[]
}

/**
 * Spec 060 D2/D2b: a hora em que o cliente recebe naquele dia.
 *
 * A precedência vai do mais específico para o mais geral, e ela é a decisão que importa:
 * **exceção do cliente vence feriado do município** (ADR-0048 §3). O CD que trabalha no feriado da
 * cidade cadastra a exceção que abre, e ela manda — sem isso, o único cliente aberto no feriado
 * seria invisível para o roteiro justamente no dia em que ele importa.
 *
 * Cliente **sem** janela cadastrada responde `unset`, não "fechado": ausência de regra é o caso
 * normal (a maioria dos destinatários recebe a qualquer hora), e tratá-la como fechado travaria a
 * operação inteira no dia seguinte ao deploy.
 */
export function resolveDeliveryWindow(
  input: ResolveDeliveryWindowParams,
): ResolvedDeliveryWindow {
  const exception = input.exceptions.find((candidate) => candidate.exceptionOn === input.date)
  if (exception !== undefined) {
    if (exception.kind === 'closed') return { intervals: [], source: 'exception' }
    return {
      intervals:
        exception.opensAt === null || exception.closesAt === null
          ? []
          : [{ closesAt: exception.closesAt, opensAt: exception.opensAt }],
      source: 'exception',
    }
  }

  if (input.holidays.some((holiday) => holiday.holidayOn === input.date)) {
    return { intervals: [], source: 'holiday' }
  }

  const weekday = weekdayOf(input.date)
  const daily = input.windows
    .filter((window) => window.weekday === weekday)
    .map((window) => ({ closesAt: window.closesAt, opensAt: window.opensAt }))
    .toSorted((left, right) => left.opensAt.localeCompare(right.opensAt))

  /**
   * A distinção entre "não recebe hoje" e "não tem cadastro de janela" é a razão de `unset` existir:
   * o cliente que recebe seg–sex está **fechado** no sábado, e o que não tem janela nenhuma não está
   * fechado dia nenhum.
   */
  if (input.windows.length === 0) return { intervals: [], source: 'unset' }

  return { intervals: daily, source: 'weekly' }
}

export type IsWithinDeliveryWindowParams = ResolveDeliveryWindowParams & {
  /** `HH:MM` ou `HH:MM:SS` no fuso da empresa. */
  readonly time: string
}

/**
 * Cliente sem janela cadastrada aceita **qualquer** hora: ausência é ausência, e é o caso da maioria.
 * A borda superior é exclusiva — quem fecha às 11h não recebe às 11h em ponto.
 */
export function isWithinDeliveryWindow(input: IsWithinDeliveryWindowParams): boolean {
  const resolved = resolveDeliveryWindow(input)
  if (resolved.source === 'unset') return true

  const time = normalizeTime(input.time)
  return resolved.intervals.some(
    (interval) => normalizeTime(interval.opensAt) <= time && time < normalizeTime(interval.closesAt),
  )
}

/**
 * Sem `Date`: `new Date('2026-08-27')` é UTC, e no fuso de São Paulo isso vira o dia anterior às 21h
 * — a data cadastrada como quinta viraria quarta, calada. A conta de Sakamoto responde o dia da
 * semana a partir dos números, e não tem fuso para errar.
 */
function weekdayOf(date: string): number {
  const [yearText, monthText, dayText] = date.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const shifted = month < 3 ? year - 1 : year

  return (
    (shifted +
      Math.floor(shifted / 4) -
      Math.floor(shifted / 100) +
      Math.floor(shifted / 400) +
      (offsets[month - 1] ?? 0) +
      day) %
    7
  )
}

/** `08:00` e `08:00:00` são o mesmo horário: o banco devolve com segundos, a tela manda sem. */
function normalizeTime(time: string): string {
  return time.length === 5 ? `${time}:00` : time
}
