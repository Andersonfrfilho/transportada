/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 P2: o filtro das notas por prazo de entrega. Roda no cliente porque o prazo depende do calendário e não
 * vira filtro paginado por cursor; é de seleção múltipla e nunca reordena: filtrar é só escolher o que se mostra.
 */
import type { TripDocumentDetail } from './trip.types'
import {
  DELIVERY_DEADLINE_FILTER_PARAMETER,
  DELIVERY_DEADLINE_FILTER_SEPARATOR,
  DELIVERY_DEADLINE_FILTER_VALUE_BY_STATE,
  DELIVERY_DEADLINE_FILTER_VALUES,
  type DeliveryDeadlineFilterValue,
} from './tripDeliveryDeadline.constant'

export type DeliveryDeadlineCounts = Readonly<Record<DeliveryDeadlineFilterValue, number>>

type DeadlineDocument = Pick<TripDocumentDetail, 'deliveryDeadline'>

/** `null` (sem prazo) e ausente (API anterior) são a mesma resposta para o operador: não há prazo a mostrar. */
export function resolveDeliveryDeadlineFilterValue(
  document: DeadlineDocument,
): DeliveryDeadlineFilterValue {
  const deadline = document.deliveryDeadline
  if (deadline === null || deadline === undefined) return 'none'
  return DELIVERY_DEADLINE_FILTER_VALUE_BY_STATE[deadline.state]
}

export function hasAnyDeliveryDeadline(documents: readonly DeadlineDocument[]): boolean {
  return documents.some((document) => resolveDeliveryDeadlineFilterValue(document) !== 'none')
}

export function filterDocumentsByDeliveryDeadline(
  input: Readonly<{
    documents: readonly TripDocumentDetail[]
    values: readonly DeliveryDeadlineFilterValue[]
  }>,
): readonly TripDocumentDetail[] {
  if (input.values.length === 0) return input.documents
  return input.documents.filter((document) =>
    input.values.includes(resolveDeliveryDeadlineFilterValue(document)),
  )
}

export function countDocumentsByDeliveryDeadline(
  documents: readonly DeadlineDocument[],
): DeliveryDeadlineCounts {
  const counts = { delivered: 0, due_today: 0, none: 0, on_time: 0, overdue: 0 }
  for (const document of documents) counts[resolveDeliveryDeadlineFilterValue(document)] += 1
  return counts
}

function isFilterValue(value: string): value is DeliveryDeadlineFilterValue {
  return DELIVERY_DEADLINE_FILTER_VALUES.some((candidate) => candidate === value)
}

/** Ordem canônica e sem repetição: a mesma escolha escreve sempre a mesma URL. */
export function normalizeDeliveryDeadlineValues(
  values: readonly string[],
): readonly DeliveryDeadlineFilterValue[] {
  return DELIVERY_DEADLINE_FILTER_VALUES.filter((candidate) => values.includes(candidate))
}

/** URL inventada não quebra a tela: o que não é uma categoria conhecida é ignorado. */
export function parseDeliveryDeadlineFilter(
  search: string,
): readonly DeliveryDeadlineFilterValue[] {
  const raw = new URLSearchParams(search).get(DELIVERY_DEADLINE_FILTER_PARAMETER) ?? ''
  return normalizeDeliveryDeadlineValues(
    raw.split(DELIVERY_DEADLINE_FILTER_SEPARATOR).filter(isFilterValue),
  )
}

export function serializeDeliveryDeadlineFilter(
  input: Readonly<{ search: string; values: readonly DeliveryDeadlineFilterValue[] }>,
): string {
  const parameters = new URLSearchParams(input.search)
  if (input.values.length === 0) parameters.delete(DELIVERY_DEADLINE_FILTER_PARAMETER)
  else {
    parameters.set(
      DELIVERY_DEADLINE_FILTER_PARAMETER,
      normalizeDeliveryDeadlineValues(input.values).join(DELIVERY_DEADLINE_FILTER_SEPARATOR),
    )
  }
  const serialized = parameters.toString()
  return serialized === '' ? '' : `?${serialized}`
}
