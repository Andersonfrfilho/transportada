/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  BusinessCalendar,
  CivilDate,
} from '../../business-calendar/domain/business-calendar.types.js'
import type {
  DELIVERY_DEADLINE_NOT_APPLICABLE_REASON,
  DELIVERY_DEADLINE_STATE,
  DELIVERY_OUTCOME_KIND,
} from './delivery-deadline.constant.js'

type OutcomeKind = (typeof DELIVERY_OUTCOME_KIND)[keyof typeof DELIVERY_OUTCOME_KIND]

export type DeliveryOutcome =
  | { readonly kind: typeof DELIVERY_OUTCOME_KIND.PENDING }
  | { readonly deliveredOn: CivilDate; readonly kind: typeof DELIVERY_OUTCOME_KIND.DELIVERED }
  | { readonly kind: Exclude<OutcomeKind, 'pending' | 'delivered'> }

export type DeliveryDeadlineNotApplicableReason =
  (typeof DELIVERY_DEADLINE_NOT_APPLICABLE_REASON)[keyof typeof DELIVERY_DEADLINE_NOT_APPLICABLE_REASON]

export type ResolveDeliveryDeadlineParams = {
  readonly arrivedOn: CivilDate | null
  /** `null` quando a nota não tem cidade de destino físico. */
  readonly calendar: BusinessCalendar | null
  /** A cópia gravada na chegada (`cargo_arrivals`), não o perfil atual do contratante. */
  readonly deadlineBusinessDays: number | null
  readonly outcome: DeliveryOutcome
  readonly today: CivilDate
}

export type ResolveDeliveryDeadlineResult =
  | {
      readonly businessDaysRemaining: number
      readonly dueOn: CivilDate
      readonly state: typeof DELIVERY_DEADLINE_STATE.ON_TIME
    }
  | { readonly dueOn: CivilDate; readonly state: typeof DELIVERY_DEADLINE_STATE.DUE_TODAY }
  | {
      readonly businessDaysLate: number
      readonly dueOn: CivilDate
      readonly state: typeof DELIVERY_DEADLINE_STATE.OVERDUE
    }
  | {
      readonly deliveredOn: CivilDate
      readonly dueOn: CivilDate
      readonly state: typeof DELIVERY_DEADLINE_STATE.DELIVERED_ON_TIME
    }
  | {
      readonly businessDaysLate: number
      readonly deliveredOn: CivilDate
      readonly dueOn: CivilDate
      readonly state: typeof DELIVERY_DEADLINE_STATE.DELIVERED_LATE
    }
  | {
      readonly reason: DeliveryDeadlineNotApplicableReason
      readonly state: typeof DELIVERY_DEADLINE_STATE.NOT_APPLICABLE
    }

/** O que a leitura serve: `not_applicable` não é estado de tela, sai como `null` no detalhe da viagem. */
export type DeliveryDeadlineView = Exclude<
  ResolveDeliveryDeadlineResult,
  { readonly state: typeof DELIVERY_DEADLINE_STATE.NOT_APPLICABLE }
>
