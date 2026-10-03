/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/driverTripResponse.validation.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CANHOTO_REJECTION_REASONS,
  isDriverOccurrenceType,
  TRIP_CREW_ROLES,
  type CanhotoRejection,
  type DriverDeliveryProofSettings,
  type DriverOccurrenceType,
  type DriverStopSchedule,
  type DriverTrip,
  type DriverTripDocument,
  type DriverTripManifest,
  type DriverTripSnapshot,
  type DriverTripStop,
  type PendingProofDocument,
  type ProofFieldRequirement,
  type TripCrewRole,
} from './driverTrip.types'
import { PROOF_CARGO_PHOTO_LIMIT } from './proofCargo.constant'
import { DEFAULT_PROOF_SETTINGS } from './proofFormPlan.service'

/**
 * Resposta de API é entrada não confiável (`security.md` §3), e aqui ela vira a tela que o motorista
 * usa com uma mão na porta do cliente: campo faltando tem de virar recusa explícita, não `undefined`
 * atravessando até um `.map` estourar no meio da rua.
 */
export class DriverTripResponseError extends Error {
  public constructor() {
    super('DRIVER_TRIP_RESPONSE_INVALID')
    this.name = 'DriverTripResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new DriverTripResponseError()
  return value
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return readString(value)
}

function readOptionalText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Spec 159 RF1: campo novo do canal do motorista. Ausente (snapshot antigo em cache) vira `false` —
 * o mesmo espírito de `readOptionalText`, nunca quebra a tela por um campo que ainda não chegou.
 */
function readProofPending(value: unknown): boolean {
  return value === true
}

/** ADR-0070 §5: a nota é inteira de 0 a 100, ou `null` sem histórico — fora disso, `null`. */
function readDriverScore(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
    ? value
    : null
}

/** Spec 193 D14: ausente (API anterior) vira `false` — nunca quebra a tela por um campo novo. */
function readRecipientIsCompany(value: unknown): boolean {
  return value === true
}

/**
 * Spec 218 RF-B2 (follow-up): `null` quando o campo não é um array — snapshot antigo em cache, ou a
 * resolução falhou no servidor (`readFieldOccurrenceTypes` isolado do `Promise.all` na API). Item
 * malformado da lista some, o mesmo espírito de `toPendingProofs` — nunca derruba o documento inteiro.
 */
function readDocumentOccurrenceTypes(value: unknown): readonly DriverOccurrenceType[] | null {
  if (!Array.isArray(value)) return null
  return value.filter(isDriverOccurrenceType)
}

function toDocument(value: unknown): DriverTripDocument {
  if (!isRecord(value)) throw new DriverTripResponseError()

  /**
   * Toda ausência vira vazio: a NF-e é dado de terceiro, e a tela do motorista não pode quebrar
   * porque o emitente não mandou o peso do volume. O que **não** pode faltar é o id e o estado —
   * sem eles não há o que tocar.
   */
  return {
    accessKey: readOptionalText(value.accessKey),
    deliveredAt: readNullableString(value.deliveredAt),
    /** Shape novo: o comprovante vem no documento. Ausente (shape antigo) vira `null` — a parada responde. */
    deliveryProof: toDeliveryProof(value.deliveryProof),
    grossWeight: readOptionalText(value.grossWeight),
    id: readString(value.id),
    number: readOptionalText(value.number),
    occurrenceTypes: readDocumentOccurrenceTypes(value.occurrenceTypes),
    proofPending: readProofPending(value.proofPending),
    recipientDisplayName: readOptionalText(value.recipientDisplayName),
    recipientIsCompany: readRecipientIsCompany(value.recipientIsCompany),
    recipientName: readOptionalText(value.recipientName),
    returnReason: readNullableString(value.returnReason),
    separationStatus: readString(value.separationStatus),
    series: readOptionalText(value.series),
    totalAmount: readOptionalText(value.totalAmount),
    volumeCount: readOptionalText(value.volumeCount),
  }
}

/**
 * Manifesto ausente é o caso normal, não defeito de resposta: carga urbana não tem MDF-e. O que
 * **não** se aceita é manifesto pela metade — sem chave ou sem id não há o que oferecer ao fiscal.
 */
function toManifest(value: unknown): DriverTripManifest | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) throw new DriverTripResponseError()

  return {
    accessKey: readString(value.accessKey),
    authorizedAt: readNullableString(value.authorizedAt),
    id: readString(value.id),
    protocol: readOptionalText(value.protocol),
  }
}

/**
 * Agendamento ausente é o caso normal. O que **não** se aceita é agendamento pela metade: sem hora
 * nem protocolo ele não ajuda ninguém na portaria, e mostrá-lo vazio seria pior que não mostrar.
 */
function toSchedule(value: unknown): DriverStopSchedule | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) throw new DriverTripResponseError()

  return {
    protocol: readOptionalText(value.protocol),
    scheduledAt: readNullableString(value.scheduledAt),
    status: readString(value.status),
  }
}

const PROOF_REQUIREMENTS = ['off', 'optional', 'required']

/** Spec 193 (plan, Fase 4): campo ausente ou fora do vocabulário cai no padrão daquele campo. */
function readProofField(value: unknown, fallback: ProofFieldRequirement): ProofFieldRequirement {
  return typeof value === 'string' && PROOF_REQUIREMENTS.includes(value)
    ? (value as ProofFieldRequirement)
    : fallback
}

function readCargoMinimumCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? Math.min(PROOF_CARGO_PHOTO_LIMIT, value)
    : DEFAULT_PROOF_SETTINGS.cargoMinimumCount
}

/**
 * Spec 082 D4: configuração ausente (o corpo não é objeto) vira `null` — o app aplica o padrão em
 * vez de quebrar a tela. Spec 193 (revisão): com objeto presente, o fallback é **por campo** — um
 * campo só fora do vocabulário nunca derruba o conjunto inteiro para `null`.
 */
function toDeliveryProof(value: unknown): DriverDeliveryProofSettings | null {
  if (!isRecord(value)) return null
  return {
    cargo: readProofField(value.cargo, DEFAULT_PROOF_SETTINGS.cargo),
    cargoMinimumCount: readCargoMinimumCount(value.cargoMinimumCount),
    photo: readProofField(value.photo, DEFAULT_PROOF_SETTINGS.photo),
    receivedBy: readProofField(value.receivedBy, DEFAULT_PROOF_SETTINGS.receivedBy),
    receiverDocument: readProofField(
      value.receiverDocument,
      DEFAULT_PROOF_SETTINGS.receiverDocument,
    ),
    receiverName: readProofField(value.receiverName, DEFAULT_PROOF_SETTINGS.receiverName),
    signature: readProofField(value.signature, DEFAULT_PROOF_SETTINGS.signature),
  }
}

/** Spec 206 D9/D17: a chave PRESENTE no JSON (mesmo `null`) é API nova — ausente por completo é antiga. */
function isEnRouteFieldPresent(value: Record<string, unknown>): boolean {
  return 'enRouteSince' in value || 'enRouteTappedAt' in value
}

function toStop(value: unknown): DriverTripStop {
  if (!isRecord(value) || !Array.isArray(value.documents)) throw new DriverTripResponseError()
  if (typeof value.sequence !== 'number') throw new DriverTripResponseError()

  return {
    arrivedAt: readNullableString(value.arrivedAt),
    completedAt: readNullableString(value.completedAt),
    deliveryProof: toDeliveryProof(value.deliveryProof),
    deliveryWindowEnd: readNullableString(value.deliveryWindowEnd),
    deliveryWindowStart: readNullableString(value.deliveryWindowStart),
    documents: value.documents.map(toDocument),
    enRouteSince: readNullableString(value.enRouteSince),
    enRouteTappedAt: readNullableString(value.enRouteTappedAt),
    id: readString(value.id),
    label: readString(value.label),
    latitude: readNullableString(value.latitude),
    schedule: toSchedule(value.schedule),
    longitude: readNullableString(value.longitude),
    sequence: value.sequence,
  }
}

/**
 * Spec 220 RF29: o motivo é acessório, não essencial — recusa malformada ou motivo que este app não
 * conhece apagam a explicação, nunca a pendência. A nota precisa voltar mesmo sem legenda.
 */
function toCanhotoRejection(value: unknown): CanhotoRejection | null {
  if (!isRecord(value)) return null

  const reason = CANHOTO_REJECTION_REASONS.find((known) => known === value.reason)
  if (reason === undefined) return null

  return { note: readNullableString(value.note), reason }
}

/**
 * Spec 159 (T11): item malformado da lista raiz não derruba a tela inteira — ele só some da lista,
 * o mesmo espírito do resto deste arquivo (campo faltando é recusa explícita do item, não exceção).
 */
function toPendingProof(value: unknown): PendingProofDocument | null {
  if (!isRecord(value)) return null
  if (typeof value.documentId !== 'string' || typeof value.tripId !== 'string') return null

  return {
    canhotoRejection: toCanhotoRejection(value.canhotoRejection),
    deliveredAt: readNullableString(value.deliveredAt),
    deliveryProof: toDeliveryProof(value.deliveryProof),
    documentId: value.documentId,
    documentNumber: readOptionalText(value.documentNumber),
    documentSeries: readOptionalText(value.documentSeries),
    recipientDisplayName: readOptionalText(value.recipientDisplayName),
    recipientIsCompany: readRecipientIsCompany(value.recipientIsCompany),
    recipientName: readOptionalText(value.recipientName),
    tripId: value.tripId,
    tripStatus: readOptionalText(value.tripStatus),
  }
}

function toPendingProofs(value: unknown): readonly PendingProofDocument[] {
  if (!Array.isArray(value)) return []
  return value.map(toPendingProof).filter((item): item is PendingProofDocument => item !== null)
}

/** Spec 239 D4: ausente (snapshot anterior) vale `driver`; papel desconhecido degrada para leitura, nunca para `driver`. */
function readCrewRole(value: unknown): TripCrewRole {
  if (value === undefined) return 'driver'
  return TRIP_CREW_ROLES.find((known) => known === value) ?? 'helper'
}

function toTrip(value: unknown): DriverTrip {
  if (!isRecord(value) || !Array.isArray(value.stops)) throw new DriverTripResponseError()

  /**
   * Spec 206 D17: nenhuma parada trazendo a chave é o sinal de API antiga — o app cai no
   * comportamento anterior (Cheguei sem a trava da D6, sem "Iniciar rota" nenhum).
   */
  const isLegacyEnRouteTracking = !value.stops.some(
    (stop) => isRecord(stop) && isEnRouteFieldPresent(stop),
  )

  return {
    crewRole: readCrewRole(value.crewRole),
    id: readString(value.id),
    isLegacyEnRouteTracking,
    manifest: toManifest(value.manifest),
    status: readString(value.status),
    stops: value.stops.map(toStop),
    /**
     * Ausente (snapshot antigo no celular, ou API anterior) vira vazio e a linha da data some —
     * exigir o campo faria um cache de ontem derrubar a tela inteira.
     */
    createdAt: readOptionalText(value.createdAt),
    vehiclePlate: readString(value.vehiclePlate),
  }
}

export function toDriverTripSnapshot(payload: unknown): DriverTripSnapshot {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new DriverTripResponseError()
  const data = payload.data
  if (typeof data.isRegisteredDriver !== 'boolean' || !Array.isArray(data.trips)) {
    throw new DriverTripResponseError()
  }

  return {
    isRegisteredDriver: data.isRegisteredDriver,
    pendingProofs: toPendingProofs(data.pendingProofs),
    score: readDriverScore(data.score),
    trips: data.trips.map(toTrip),
  }
}
