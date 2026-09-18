/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverDeliveryProofSettings,
  DriverTrip,
  DriverTripDocument,
  DriverTripSnapshot,
  DriverTripStop,
  PendingProofDocument,
} from './driverTrip.types'

/** Entregue e devolvida saíram do eixo do campo: não há mais o que tocar nelas. */
const SETTLED_STATUSES = ['delivered', 'returned']

export function isDocumentSettled(document: DriverTripDocument): boolean {
  return SETTLED_STATUSES.includes(document.separationStatus)
}

export function isStopPending(stop: DriverTripStop): boolean {
  return stop.completedAt === null
}

/**
 * A primeira pendente é a que o motorista está fazendo agora — é ela que a tela destaca. Sem isso
 * ele lê a lista inteira em cada parada para achar onde está, com o caminhão parado em fila dupla.
 */
export function findCurrentStop(trip: DriverTrip): DriverTripStop | undefined {
  return trip.stops.find(isStopPending)
}

/**
 * Spec 082 (revisão): a viagem `route_planned` chega ao motorista, mas as ações de campo só abrem
 * depois de ele iniciar o trajeto — a API recusa escritas fora de `dispatched`/`in_transit`, e a
 * fila offline não pode acumular eventos condenados.
 */
export function isAwaitingDispatch(trip: DriverTrip): boolean {
  return trip.status === 'route_planned'
}

/**
 * A foto da ocorrência pega carona no proof de **uma** nota da parada: a primeira ainda em aberto,
 * senão a primeira da lista. A escolha mora aqui porque a prévia e o envio precisam apontar para a
 * mesma nota — duplicada, uma das cópias divergiria calada.
 */
export function findOccurrencePhotoDocument(stop: DriverTripStop): DriverTripDocument | undefined {
  return stop.documents.find((document) => !isDocumentSettled(document)) ?? stop.documents[0]
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
