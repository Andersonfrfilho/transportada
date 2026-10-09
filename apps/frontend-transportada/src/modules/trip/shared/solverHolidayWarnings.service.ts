/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DayChecksClient } from './dayChecksClient.service'
import { matchDayCheckWarnings, planDayChecks } from './holidayWarningPlan.service'
import type { HolidayWarning } from './trip.types'

export const NO_HOLIDAY_WARNINGS: ReadonlyMap<string, readonly HolidayWarning[]> = new Map()

type SolverStopArrival = Readonly<{
  addressKey: string
  estimatedArrivalAt: null | string
  sequence: number
}>

/** O que a rota respondeu: o aviso por parada e quais paradas ela chegou a conferir. */
type DayChecksAnswer = Readonly<{
  byStop: ReadonlyMap<string, readonly HolidayWarning[]>
  checkedStops: ReadonlySet<string>
}>

/**
 * Spec 252 T5.3: UMA chamada a `day-checks` com os pares cidade e dia das paradas. `undefined` é "não deu para
 * perguntar" — rota caída, resposta fora do formato ou pares demais — e aí o término mantém o aviso nacional de hoje:
 * o aviso é refinamento, e o roteiro já pronto não pode cair por causa dele.
 */
export async function askHolidayWarnings(input: {
  readonly client: DayChecksClient
  readonly stops: readonly SolverStopArrival[]
}): Promise<DayChecksAnswer | undefined> {
  const plan = planDayChecks(input.stops)
  if (plan.isTooLarge || plan.items.length === 0) return undefined
  try {
    const warnings = await input.client.check(plan.items)
    return {
      byStop: matchDayCheckWarnings({ targets: plan.targets, warnings }),
      checkedStops: new Set(plan.targets.map((target) => target.addressKey)),
    }
  } catch {
    return undefined
  }
}

/** O término fala da última parada com chegada: só deixa de avisar o feriado nacional se ela foi conferida. */
export function isFinishCovered(input: {
  readonly answer: DayChecksAnswer | undefined
  readonly stops: readonly SolverStopArrival[]
}): boolean {
  if (input.answer === undefined) return false
  const last = [...input.stops]
    .sort((left, right) => right.sequence - left.sequence)
    .find((stop) => stop.estimatedArrivalAt !== null)
  return last !== undefined && input.answer.checkedStops.has(last.addressKey)
}
