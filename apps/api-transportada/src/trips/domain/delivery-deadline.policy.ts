/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 RF1/RF2: o prazo de entrega de uma nota. Pura: datas civis em texto, sem relógio, sem fuso
 * e sem I/O — quem converte instante em data é `delivery-deadline-input.service.ts`. As 24 h de
 * separação correm dentro dos dias úteis, por isso a janela não existe na assinatura. Só informa:
 * nenhum outro cálculo (nota do motorista, comprovante, CT-e) depende deste arquivo.
 */
import {
  addBusinessDays,
  countBusinessDays,
} from '../../business-calendar/domain/business-calendar.policy.js'
import type {
  BusinessCalendar,
  CivilDate,
} from '../../business-calendar/domain/business-calendar.types.js'
import {
  DELIVERY_DEADLINE_NOT_APPLICABLE_REASON as REASON,
  DELIVERY_DEADLINE_STATE as STATE,
  DELIVERY_OUTCOME_KIND,
} from './delivery-deadline.constant.js'
import type {
  DeliveryDeadlineNotApplicableReason,
  DeliveryOutcome,
  ResolveDeliveryDeadlineParams,
  ResolveDeliveryDeadlineResult,
} from './delivery-deadline.types.js'

type DatedParams = {
  readonly calendar: BusinessCalendar
  readonly dueOn: CivilDate
}

type DeliveredParams = DatedParams & { readonly deliveredOn: CivilDate }

type PendingParams = DatedParams & { readonly today: CivilDate }

const BLOCKING_REASON_BY_OUTCOME: Readonly<
  Partial<Record<DeliveryOutcome['kind'], DeliveryDeadlineNotApplicableReason>>
> = {
  [DELIVERY_OUTCOME_KIND.CANCELLED]: REASON.CANCELLED,
  [DELIVERY_OUTCOME_KIND.RELEASED]: REASON.RELEASED,
  [DELIVERY_OUTCOME_KIND.RETURNED]: REASON.RETURNED,
  [DELIVERY_OUTCOME_KIND.RETURNED_TO_CONTRACTOR]: REASON.RETURNED_TO_CONTRACTOR,
}

function notApplicable(reason: DeliveryDeadlineNotApplicableReason): ResolveDeliveryDeadlineResult {
  return { reason, state: STATE.NOT_APPLICABLE }
}

// `YYYY-MM-DD` ordena como texto: as datas chegam validadas pelo calendário.
function resolveDelivered({
  calendar,
  deliveredOn,
  dueOn,
}: DeliveredParams): ResolveDeliveryDeadlineResult {
  if (deliveredOn <= dueOn) return { deliveredOn, dueOn, state: STATE.DELIVERED_ON_TIME }

  const { businessDays } = countBusinessDays({ calendar, from: dueOn, to: deliveredOn })
  return { businessDaysLate: businessDays, deliveredOn, dueOn, state: STATE.DELIVERED_LATE }
}

/** `businessDaysLate` pode ser 0: sábado depois de vencer na sexta é vencida, sem dia útil de atraso. */
function resolvePending({ calendar, dueOn, today }: PendingParams): ResolveDeliveryDeadlineResult {
  if (today === dueOn) return { dueOn, state: STATE.DUE_TODAY }

  if (today < dueOn) {
    const { businessDays } = countBusinessDays({ calendar, from: today, to: dueOn })
    return { businessDaysRemaining: businessDays, dueOn, state: STATE.ON_TIME }
  }

  const { businessDays } = countBusinessDays({ calendar, from: dueOn, to: today })
  return { businessDaysLate: businessDays, dueOn, state: STATE.OVERDUE }
}

export function resolveDeliveryDeadline({
  arrivedOn,
  calendar,
  deadlineBusinessDays,
  outcome,
  today,
}: ResolveDeliveryDeadlineParams): ResolveDeliveryDeadlineResult {
  const blockingReason = BLOCKING_REASON_BY_OUTCOME[outcome.kind]
  if (blockingReason !== undefined) return notApplicable(blockingReason)
  if (arrivedOn === null) return notApplicable(REASON.NO_ARRIVAL)
  if (deadlineBusinessDays === null) return notApplicable(REASON.NO_DEADLINE)
  if (calendar === null) return notApplicable(REASON.NO_DESTINATION_CITY)

  const { date: dueOn } = addBusinessDays({
    calendar,
    days: deadlineBusinessDays,
    start: arrivedOn,
  })
  if (outcome.kind === DELIVERY_OUTCOME_KIND.DELIVERED) {
    return resolveDelivered({ calendar, deliveredOn: outcome.deliveredOn, dueOn })
  }

  return resolvePending({ calendar, dueOn, today })
}
