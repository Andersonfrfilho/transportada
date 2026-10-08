/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 RF6: o que o selo do prazo de entrega diz. Função pura sobre o que a API mandou; o texto sai do
 * locale pela chave devolvida aqui, nunca montado em código.
 */
import type { TripDocumentDeliveryDeadline } from './trip.types'
import {
  DELIVERY_DEADLINE_ENGLISH_LANGUAGE,
  DELIVERY_DEADLINE_LABEL_PREFIX,
  DELIVERY_DEADLINE_TONE_BY_STATE,
  type DeliveryDeadlineTone,
} from './tripDeliveryDeadline.constant'

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

export type DeliveryDeadlineView = Readonly<{
  count: number | undefined
  dueOn: string
  labelKey: string
  state: TripDocumentDeliveryDeadline['state']
  tone: DeliveryDeadlineTone
}>

function buildLabelKey(name: string): string {
  return `${DELIVERY_DEADLINE_LABEL_PREFIX}.${name}`
}

/** Atraso de zero dia útil (fim de semana logo depois do vencimento) é "vencida", nunca "há 0 dias". */
function resolveLateLabel(
  input: Readonly<{
    businessDaysLate: number
    names: Readonly<{ plain: string; withDays: string }>
  }>,
): Pick<DeliveryDeadlineView, 'count' | 'labelKey'> {
  if (input.businessDaysLate === 0) {
    return { count: undefined, labelKey: buildLabelKey(input.names.plain) }
  }
  return { count: input.businessDaysLate, labelKey: buildLabelKey(input.names.withDays) }
}

function resolveLabel(
  deadline: TripDocumentDeliveryDeadline,
): Pick<DeliveryDeadlineView, 'count' | 'labelKey'> {
  switch (deadline.state) {
    case 'on_time':
      return { count: deadline.businessDaysRemaining, labelKey: buildLabelKey('onTime') }
    case 'due_today':
      return { count: undefined, labelKey: buildLabelKey('dueToday') }
    case 'overdue':
      return resolveLateLabel({
        businessDaysLate: deadline.businessDaysLate,
        names: { plain: 'overdue', withDays: 'overdueWithDays' },
      })
    case 'delivered_on_time':
      return { count: undefined, labelKey: buildLabelKey('deliveredOnTime') }
    case 'delivered_late':
      return resolveLateLabel({
        businessDaysLate: deadline.businessDaysLate,
        names: { plain: 'deliveredLate', withDays: 'deliveredLateWithDays' },
      })
  }
}

export function resolveDeliveryDeadlineView(
  deadline: TripDocumentDeliveryDeadline,
): DeliveryDeadlineView {
  return {
    ...resolveLabel(deadline),
    dueOn: deadline.dueOn,
    state: deadline.state,
    tone: DELIVERY_DEADLINE_TONE_BY_STATE[deadline.state],
  }
}

/**
 * `dueOn` é uma data de calendário, não um instante: `new Date('2026-10-15')` é a meia-noite UTC e, em São Paulo,
 * vira 14/10. A data só é separada em partes, sem passar por fuso algum.
 */
export function formatDeliveryDeadlineDate(
  input: Readonly<{ language: string; value: string }>,
): string {
  const parts = CIVIL_DATE_PATTERN.exec(input.value)
  if (parts === null) return input.value
  const [, year, month, day] = parts
  return input.language.startsWith(DELIVERY_DEADLINE_ENGLISH_LANGUAGE)
    ? `${month}/${day}/${year}`
    : `${day}/${month}/${year}`
}
