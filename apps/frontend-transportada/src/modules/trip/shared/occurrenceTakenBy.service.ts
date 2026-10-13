/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quem pegou a tratativa (spec 164): a pessoa que iniciou a validação interna. A API manda
 * `takenBy`; aqui só se decide o que a tela diz — nunca se inventa um responsável.
 */
import { initialsOf } from './tripOccurrenceDetail.service'
import type { TripOccurrenceCaseView } from './tripOccurrenceFeed.service'

/** Passadas estas horas sem ninguém pegar, o aviso deixa de ser neutro e vira atenção. */
export const TAKEN_BY_STALE_AFTER_HOURS = 4

const MILLISECONDS_PER_HOUR = 3_600_000

export type OccurrenceTakenByView =
  | Readonly<{ initials: string; kind: 'taken'; name: null | string; takenAt: string }>
  | Readonly<{ hoursWaiting: number; isStale: boolean; kind: 'waiting'; since: string }>
  | Readonly<{ kind: 'none' }>

export function resolveOccurrenceTakenByView({
  now,
  occurrenceCase,
}: Readonly<{
  now: number
  occurrenceCase: null | TripOccurrenceCaseView
}>): null | OccurrenceTakenByView {
  if (occurrenceCase === null) return null
  const { takenBy } = occurrenceCase
  if (takenBy !== null) {
    return {
      initials: takenBy.displayName === null ? '' : initialsOf(takenBy.displayName),
      kind: 'taken',
      name: takenBy.displayName,
      takenAt: takenBy.takenAt,
    }
  }
  if (occurrenceCase.status !== 'recorded') return { kind: 'none' }
  const elapsed = now - new Date(occurrenceCase.updatedAt).getTime()
  const hoursWaiting = Math.max(0, Math.floor(elapsed / MILLISECONDS_PER_HOUR))
  return {
    hoursWaiting,
    isStale: hoursWaiting >= TAKEN_BY_STALE_AFTER_HOURS,
    kind: 'waiting',
    since: occurrenceCase.updatedAt,
  }
}
