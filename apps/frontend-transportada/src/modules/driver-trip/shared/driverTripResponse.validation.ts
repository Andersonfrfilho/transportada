/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverStopSchedule,
  DriverTrip,
  DriverTripDocument,
  DriverTripManifest,
  DriverTripSnapshot,
  DriverTripStop,
} from './driverTrip.types'

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
    grossWeight: readOptionalText(value.grossWeight),
    id: readString(value.id),
    number: readOptionalText(value.number),
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

function toStop(value: unknown): DriverTripStop {
  if (!isRecord(value) || !Array.isArray(value.documents)) throw new DriverTripResponseError()
  if (typeof value.sequence !== 'number') throw new DriverTripResponseError()

  return {
    arrivedAt: readNullableString(value.arrivedAt),
    completedAt: readNullableString(value.completedAt),
    deliveryWindowEnd: readNullableString(value.deliveryWindowEnd),
    deliveryWindowStart: readNullableString(value.deliveryWindowStart),
    documents: value.documents.map(toDocument),
    id: readString(value.id),
    label: readString(value.label),
    latitude: readNullableString(value.latitude),
    schedule: toSchedule(value.schedule),
    longitude: readNullableString(value.longitude),
    sequence: value.sequence,
  }
}

function toTrip(value: unknown): DriverTrip {
  if (!isRecord(value) || !Array.isArray(value.stops)) throw new DriverTripResponseError()

  return {
    id: readString(value.id),
    manifest: toManifest(value.manifest),
    status: readString(value.status),
    stops: value.stops.map(toStop),
    vehiclePlate: readString(value.vehiclePlate),
  }
}

export function toDriverTripSnapshot(payload: unknown): DriverTripSnapshot {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new DriverTripResponseError()
  const data = payload.data
  if (typeof data.isRegisteredDriver !== 'boolean' || !Array.isArray(data.trips)) {
    throw new DriverTripResponseError()
  }

  return { isRegisteredDriver: data.isRegisteredDriver, trips: data.trips.map(toTrip) }
}
