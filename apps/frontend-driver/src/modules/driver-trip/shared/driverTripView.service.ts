/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/driverTripView.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverDeliveryProofSettings,
  DriverTrip,
  DriverTripDocument,
  DriverTripSnapshot,
  DriverTripStop,
  PendingProofDocument,
} from './driverTrip.types'
import { canReportOnTrip } from './tripCrewRole.service'

/** Entregue e devolvida saíram do eixo do campo: não há mais o que tocar nelas. */
const SETTLED_STATUSES = ['delivered', 'returned']

export function isDocumentSettled(document: DriverTripDocument): boolean {
  return SETTLED_STATUSES.includes(document.separationStatus)
}

export function isStopPending(stop: DriverTripStop): boolean {
  return stop.completedAt === null
}

/**
 * Spec 206 D9: a parada ATUAL é a que está a caminho — senão a primeira pendente, como antes. É ela
 * que a tela destaca e abre sozinha. Sem isso ele lê a lista inteira em cada parada para achar onde
 * está, com o caminhão parado em fila dupla.
 */
export function findCurrentStop(input: {
  readonly enRouteStopId: string | undefined
  readonly trip: DriverTrip
}): DriverTripStop | undefined {
  if (input.enRouteStopId !== undefined) {
    const enRouteStop = input.trip.stops.find((stop) => stop.id === input.enRouteStopId)
    if (enRouteStop !== undefined) return enRouteStop
  }
  return input.trip.stops.find(isStopPending)
}

/**
 * Spec 082 (revisão): a viagem `route_planned` chega ao motorista, mas as ações de campo só abrem
 * depois de ele iniciar o trajeto — a API recusa escritas fora de `dispatched`/`in_transit`, e a
 * fila offline não pode acumular eventos condenados.
 */
export function isAwaitingDispatch(trip: DriverTrip): boolean {
  return trip.status === 'route_planned'
}

type DispatchStateInput = {
  readonly isDispatchQueued?: boolean
  readonly trip: Pick<DriverTrip, 'crewRole' | 'status'>
}

/** Spec 243 D1: a espera é fato da viagem (todo papel a vê); despachar é permissão de quem reporta. */
export function resolveDispatchState({ isDispatchQueued = false, trip }: DispatchStateInput): {
  readonly canDispatch: boolean
  readonly isAwaiting: boolean
} {
  const isAwaiting = trip.status === 'route_planned' && !isDispatchQueued
  return { canDispatch: isAwaiting && canReportOnTrip(trip), isAwaiting }
}

export function countPendingDocuments(stop: DriverTripStop): number {
  return stop.documents.filter((document) => !isDocumentSettled(document)).length
}

/** Spec 159 RF12: a nota que o card avisa — foto obrigatória e ainda não entregue. */
export function isProofPendingWarningDue(input: {
  readonly document: DriverTripDocument
  readonly stopProofSettings: DriverDeliveryProofSettings | null
}): boolean {
  const proofSettings = input.document.deliveryProof ?? input.stopProofSettings
  return proofSettings?.photo === 'required' && !isDocumentSettled(input.document)
}

/**
 * Spec 159 (T11, revisão): a lista da tela "fotos pendentes" **lê a raiz do snapshot**, não mais
 * percorre `trips` — é o único jeito de enxergar a pendente de uma viagem já `completed`, que sai
 * de `trips` mas continua em `pendingProofs`. A ordem é a que a API mandou.
 */
export function listProofPendingDocuments(
  snapshot: DriverTripSnapshot | undefined,
): readonly PendingProofDocument[] {
  return snapshot?.pendingProofs ?? []
}

export type ProofDocumentLabel = Readonly<{
  number: string
  recipientName: string
  series: string
}>

/**
 * Spec 159 (T12): o aviso de pontualidade diz **de qual nota** é — três avisos iguais sem nome não
 * dizem ao motorista qual foto saiu atrasada. Procura na lista de pendentes e, depois, na viagem.
 */
export function findProofDocumentLabel(input: {
  readonly documentId: string
  readonly snapshot: DriverTripSnapshot | undefined
}): ProofDocumentLabel | undefined {
  const pending = input.snapshot?.pendingProofs.find((item) => item.documentId === input.documentId)
  if (pending !== undefined) {
    return {
      number: pending.documentNumber,
      recipientName: pending.recipientName,
      series: pending.documentSeries,
    }
  }
  const document = input.snapshot?.trips
    .flatMap((trip) => trip.stops)
    .flatMap((stop) => stop.documents)
    .find((candidate) => candidate.id === input.documentId)
  if (document === undefined) return undefined
  return { number: document.number, recipientName: document.recipientName, series: document.series }
}

/**
 * ADR-0045 §8: navegar é delegar. O endereço vai como busca para o app de mapa que a pessoa já usa;
 * a coordenada entra quando existe, porque pino é melhor que texto quando o endereço é ambíguo.
 */
export function buildNavigationHref(stop: DriverTripStop): string {
  if (stop.latitude !== null && stop.longitude !== null) {
    return `https://maps.google.com/?q=${stop.latitude},${stop.longitude}`
  }

  return `https://maps.google.com/?q=${encodeURIComponent(stop.label)}`
}

/** Sem acento e sem caixa: o motorista digita "sao jose" e a nota diz "São José". */
function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

/**
 * A parada bate quando o termo aparece no endereço dela ou em qualquer nota — número, destinatário
 * ou chave de acesso. A chave inteira é o que o leitor de QR code entrega.
 */
export function matchesStopSearchTerm(stop: DriverTripStop, searchTerm: string): boolean {
  const term = normalizeSearchText(searchTerm)
  if (term === '') return true

  const haystack = [
    stop.label,
    ...stop.documents.flatMap((document) => [
      document.number,
      document.recipientName,
      document.recipientDisplayName,
      document.accessKey,
    ]),
  ]

  return haystack.some((candidate) => normalizeSearchText(candidate).includes(term))
}

export function filterStopsBySearchTerm(
  stops: readonly DriverTripStop[],
  searchTerm: string,
): readonly DriverTripStop[] {
  return stops.filter((stop) => matchesStopSearchTerm(stop, searchTerm))
}
