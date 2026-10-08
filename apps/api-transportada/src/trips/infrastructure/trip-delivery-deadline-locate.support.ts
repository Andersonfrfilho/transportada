/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.2c: de nota com chegada a nota com cidade e momento de entrega, só em memória. A cidade é a
 * do destino físico com o desvio manual por cima (que a política de destino físico não conhece).
 */
import { toCivilDate } from '../../business-calendar/application/civil-date.service.js'
import {
  BUSINESS_CALENDAR_TIME_ZONE,
  CITY_IBGE_CODE_PATTERN,
} from '../../business-calendar/domain/business-calendar.constant.js'
import type { DeliveryInstantOutcome } from '../application/delivery-deadline-input.service.js'
import { DELIVERY_OUTCOME_KIND } from '../domain/delivery-deadline.constant.js'
import type {
  DeadlineCandidate,
  DeliveryDeadlineNote,
  DeliveryDeadlineStopAddresses,
  LocatedCandidate,
} from './trip-delivery-deadline.types.js'

export function isCandidate(note: DeliveryDeadlineNote): note is DeadlineCandidate {
  return note.arrivedAt !== null && note.deadlineBusinessDays !== null
}

export function civilYearOf(instant: Date): number {
  return Number(toCivilDate({ instant, timeZone: BUSINESS_CALENDAR_TIME_ZONE }).slice(0, 4))
}

function toValidCity(code: string | null | undefined): string | null {
  return code !== null && code !== undefined && CITY_IBGE_CODE_PATTERN.test(code) ? code : null
}

type LocateParams = {
  readonly candidates: readonly DeadlineCandidate[]
  readonly deliveredMoments: ReadonlyMap<string, Date>
  readonly overrides: ReadonlyMap<string, string | null>
  readonly stopAddresses: DeliveryDeadlineStopAddresses
}

/** Sem cidade válida a nota fica sem prazo: o calendário nunca "assume" município. */
export function locateCandidates(params: LocateParams): readonly LocatedCandidate[] {
  return params.candidates.flatMap((note) => {
    const address =
      note.nfeDocumentId === null ? undefined : params.stopAddresses.get(note.nfeDocumentId)
    const rawCity = params.overrides.has(note.tripDocumentId)
      ? params.overrides.get(note.tripDocumentId)
      : address?.components.cityCode
    const cityIbgeCode = toValidCity(rawCity)
    if (cityIbgeCode === null) return []

    return [
      { cityIbgeCode, deliveredAt: params.deliveredMoments.get(note.tripDocumentId) ?? null, note },
    ]
  })
}

/** Só o evento mede a entrega (234), nunca a hora que o servidor gravou na nota: sem ele, `undefined`. */
export function toInstantOutcome(located: LocatedCandidate): DeliveryInstantOutcome | undefined {
  const { deliveredAt, note } = located
  if (note.outcomeKind !== DELIVERY_OUTCOME_KIND.DELIVERED) return { kind: note.outcomeKind }
  if (deliveredAt === null) return undefined

  return { deliveredAt, kind: DELIVERY_OUTCOME_KIND.DELIVERED }
}
