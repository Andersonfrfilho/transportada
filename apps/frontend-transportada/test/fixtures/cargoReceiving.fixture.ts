/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4: a chegada no formato que a API devolve (`apps/api-transportada/src/cargo-receiving`).
 * Dados sintéticos: contratantes e destinatários inventados, cidades reais.
 */
import type {
  AvailableCargoDocument,
  CargoArrivalDetail,
  CargoArrivalDocument,
  CargoArrivalGroup,
  CargoArrivalSummary,
  CargoDocumentState,
  CargoStateCounts,
} from '@/modules/cargo-receiving/shared/cargoArrival.types'

export const ARRIVAL_ID = '00000000-0000-4000-8000-0000002372a1'
export const CLOSED_ARRIVAL_ID = '00000000-0000-4000-8000-0000002372a2'
export const ALFA_ID = '00000000-0000-4000-8000-000000237a01'
export const BETA_ID = '00000000-0000-4000-8000-000000237a02'

export function documentIdOf(number: number): string {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
}

export function buildDocument(
  overrides: Partial<CargoArrivalDocument> & Readonly<{ number: string }>,
): CargoArrivalDocument {
  return {
    accessKey: `3526${overrides.number.padStart(40, '0')}`,
    cityIbgeCode: '3538709',
    cityName: 'Piracicaba',
    isInLiveTrip: false,
    nfeDocumentId: documentIdOf(Number(overrides.number)),
    receivedAt: null,
    recipientName: `Mercado Fictício ${overrides.number}`,
    routeName: 'FR.S.CAR',
    separatedAt: null,
    separationState: 'expected',
    series: '1',
    ...overrides,
  }
}

export function countStates(documents: readonly CargoArrivalDocument[]): CargoStateCounts {
  const counts = { expected: 0, received: 0, separated: 0, total: documents.length }
  for (const document of documents) counts[document.separationState] += 1
  return counts
}

/** A mesma regra da API: agrupa por rota × cidade na ordem em que as notas chegam já ordenadas. */
export function buildGroups(documents: readonly CargoArrivalDocument[]): CargoArrivalGroup[] {
  const groups = new Map<string, CargoArrivalDocument[]>()
  for (const document of documents) {
    const key = JSON.stringify([document.routeName, document.cityIbgeCode])
    groups.set(key, [...(groups.get(key) ?? []), document])
  }
  return [...groups.values()].map((members) => ({
    cityIbgeCode: members[0]?.cityIbgeCode ?? null,
    counts: countStates(members),
    documents: members,
    routeName: members[0]?.routeName ?? null,
  }))
}

export const DEFAULT_DOCUMENTS: readonly CargoArrivalDocument[] = [
  buildDocument({ number: '1001' }),
  buildDocument({ number: '1002', receivedAt: '2026-10-03T13:00:00.000Z', separationState: 'received' }),
  buildDocument({
    number: '1003',
    receivedAt: '2026-10-03T13:00:00.000Z',
    separatedAt: '2026-10-03T13:30:00.000Z',
    separationState: 'separated',
  }),
  buildDocument({ cityIbgeCode: '3526902', cityName: 'Limeira', number: '1004' }),
  buildDocument({ cityIbgeCode: '3526902', cityName: 'Limeira', number: '1005' }),
  buildDocument({
    cityIbgeCode: '3552205',
    cityName: 'Sorocaba',
    isInLiveTrip: true,
    number: '1006',
    routeName: 'FR.N.SOR',
  }),
  buildDocument({ cityIbgeCode: null, cityName: null, number: '1007', routeName: null }),
]

export function buildSummary(overrides: Partial<CargoArrivalSummary> = {}): CargoArrivalSummary {
  return {
    arrivedAt: '2026-10-03T12:00:00.000Z',
    contractorId: ALFA_ID,
    contractorName: 'Alfa Indústria Fictícia',
    counts: countStates(DEFAULT_DOCUMENTS),
    createdAt: '2026-10-03T12:05:00.000Z',
    deliveryDeadlineBusinessDays: 3,
    id: ARRIVAL_ID,
    isSeparationOverdue: false,
    palletCount: 12,
    reference: 'Lacre 4471',
    separationDueAt: '2026-10-04T12:00:00.000Z',
    separationWindowHours: 24,
    status: 'open',
    ...overrides,
  }
}

export function buildDetail(
  overrides: Partial<CargoArrivalSummary> & { documents?: readonly CargoArrivalDocument[] } = {},
): CargoArrivalDetail {
  const { documents = DEFAULT_DOCUMENTS, ...summary } = overrides
  return {
    ...buildSummary({ counts: countStates(documents), ...summary }),
    groups: buildGroups(documents),
  }
}

export function withDocumentState(
  detail: CargoArrivalDetail,
  states: Readonly<Record<string, CargoDocumentState>>,
): CargoArrivalDetail {
  const documents = detail.groups
    .flatMap((group) => group.documents)
    .map((document) => ({
      ...document,
      separationState: states[document.nfeDocumentId] ?? document.separationState,
    }))
  return buildDetail({ ...detail, documents })
}

export function buildAvailable(
  number: number,
  overrides: Partial<AvailableCargoDocument> = {},
): AvailableCargoDocument {
  return {
    accessKey: `3526${String(number).padStart(40, '0')}`,
    cityIbgeCode: '3538709',
    cityName: 'Piracicaba',
    id: documentIdOf(number),
    issuedAt: '2026-10-03T08:00:00.000Z',
    number: String(number),
    recipientName: `Destinatário Fictício ${String(number)}`,
    series: '1',
    state: 'SP',
    totalValue: '2664.00',
    ...overrides,
  }
}
