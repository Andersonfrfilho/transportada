/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.1: a borda onde os instantes (chegada, entrega, agora) viram dia civil de São Paulo e
 * seguem para a política pura. A hora do dia não importa; `new Date('2026-10-15')` ou o dia em UTC
 * trocariam o dia de quem chega ou entrega à noite.
 */
import { toCivilDate } from '../../business-calendar/application/civil-date.service.js'
import type { BusinessCalendar } from '../../business-calendar/domain/business-calendar.types.js'
import {
  DELIVERY_DEADLINE_TIME_ZONE,
  DELIVERY_OUTCOME_KIND,
} from '../domain/delivery-deadline.constant.js'
import { resolveDeliveryDeadline } from '../domain/delivery-deadline.policy.js'
import type {
  DeliveryOutcome,
  ResolveDeliveryDeadlineResult,
} from '../domain/delivery-deadline.types.js'

type DeliveredInstantOutcome = {
  /** O momento do último evento `delivered` (`deliveredMomentSql`), nunca a chegada ao servidor. */
  readonly deliveredAt: Date
  readonly kind: typeof DELIVERY_OUTCOME_KIND.DELIVERED
}

export type DeliveryInstantOutcome =
  | DeliveredInstantOutcome
  | Exclude<DeliveryOutcome, { readonly kind: typeof DELIVERY_OUTCOME_KIND.DELIVERED }>

export type ResolveDeliveryDeadlineFromInstantsParams = {
  readonly arrivedAt: Date | null
  readonly calendar: BusinessCalendar | null
  readonly deadlineBusinessDays: number | null
  readonly now: Date
  readonly outcome: DeliveryInstantOutcome
}

function toBusinessDay(instant: Date): string {
  return toCivilDate({ instant, timeZone: DELIVERY_DEADLINE_TIME_ZONE })
}

function toDeliveryOutcome(outcome: DeliveryInstantOutcome): DeliveryOutcome {
  if (outcome.kind !== DELIVERY_OUTCOME_KIND.DELIVERED) return outcome

  return { deliveredOn: toBusinessDay(outcome.deliveredAt), kind: outcome.kind }
}

export function resolveDeliveryDeadlineFromInstants({
  arrivedAt,
  calendar,
  deadlineBusinessDays,
  now,
  outcome,
}: ResolveDeliveryDeadlineFromInstantsParams): ResolveDeliveryDeadlineResult {
  return resolveDeliveryDeadline({
    arrivedOn: arrivedAt === null ? null : toBusinessDay(arrivedAt),
    calendar,
    deadlineBusinessDays,
    outcome: toDeliveryOutcome(outcome),
    today: toBusinessDay(now),
  })
}
