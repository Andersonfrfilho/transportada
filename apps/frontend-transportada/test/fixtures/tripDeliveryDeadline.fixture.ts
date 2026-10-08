/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T2.1: notas e paradas sintéticas com o prazo de entrega nos cinco estados, uma sem prazo (`null`) e
 * uma de API anterior (sem o campo). Só dados fictícios.
 */
import type {
  TripDocumentDeliveryDeadline,
  TripDocumentDetail,
  TripStopDetail,
} from '@/modules/trip/shared/trip.types'

export const DEADLINE_DUE_ON = '2026-10-15'

type DeadlineDocumentInput = Readonly<{
  deadline?: null | TripDocumentDeliveryDeadline
  id: string
  number: string
  separationStatus?: TripDocumentDetail['separationStatus']
}>

export function buildDeadlineDocument(input: DeadlineDocumentInput): TripDocumentDetail {
  return {
    contact: null,
    createdAt: '2026-10-07T12:00:00.000Z',
    cteAuthorized: false,
    deliveredAt: null,
    destinationOrigin: 'recipient',
    ...(input.deadline === undefined ? {} : { deliveryDeadline: input.deadline }),
    fiscalStatus: 'authorized',
    freightCalculationId: null,
    id: input.id,
    loadedAt: null,
    nfeDocumentId: `nfe-${input.id}`,
    nfeNumber: input.number,
    nfeSeries: '1',
    releasedAt: null,
    returnReason: null,
    returnedAt: null,
    separatedAt: null,
    separationStatus: input.separationStatus ?? 'pending',
    stopId: null,
    tripId: 'trip-1',
    updatedAt: '2026-10-07T12:00:00.000Z',
  } as unknown as TripDocumentDetail
}

/** Uma nota por estado, nesta ordem: vencida, vence hoje, no prazo, entregue no prazo, entregue com atraso, nula, antiga. */
export const DEADLINE_DOCUMENTS: readonly TripDocumentDetail[] = [
  buildDeadlineDocument({
    deadline: { businessDaysLate: 1, dueOn: DEADLINE_DUE_ON, state: 'overdue' },
    id: 'doc-overdue',
    number: '1001',
  }),
  buildDeadlineDocument({
    deadline: { dueOn: DEADLINE_DUE_ON, state: 'due_today' },
    id: 'doc-today',
    number: '1002',
  }),
  buildDeadlineDocument({
    deadline: { businessDaysRemaining: 2, dueOn: DEADLINE_DUE_ON, state: 'on_time' },
    id: 'doc-on-time',
    number: '1003',
  }),
  buildDeadlineDocument({
    deadline: { deliveredOn: DEADLINE_DUE_ON, dueOn: DEADLINE_DUE_ON, state: 'delivered_on_time' },
    id: 'doc-delivered',
    number: '1004',
    separationStatus: 'delivered',
  }),
  buildDeadlineDocument({
    deadline: {
      businessDaysLate: 2,
      deliveredOn: '2026-10-19',
      dueOn: DEADLINE_DUE_ON,
      state: 'delivered_late',
    },
    id: 'doc-delivered-late',
    number: '1005',
    separationStatus: 'delivered',
  }),
  buildDeadlineDocument({ deadline: null, id: 'doc-null', number: '1006' }),
  buildDeadlineDocument({ id: 'doc-legacy', number: '1007' }),
]

export function buildDeadlineStop(
  input: Readonly<{ documents: readonly TripDocumentDetail[]; id: string; sequence: number }>,
): TripStopDetail {
  return {
    addressKey: `address-${input.id}`,
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: input.documents,
    id: input.id,
    label: `Parada ${String(input.sequence)}`,
    sequence: input.sequence,
  }
}
