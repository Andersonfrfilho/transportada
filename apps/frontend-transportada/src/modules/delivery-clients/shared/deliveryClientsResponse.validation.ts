/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DeliveryClient,
  DeliveryClientDetail,
  DeliveryClientPage,
  DeliveryException,
  DeliveryWindow,
} from './deliveryClients.types'

/**
 * Resposta de API é entrada não confiável (`security.md` §3). Aqui ela vira a tela onde alguém
 * cadastra a hora que decide se o caminhão sai: campo faltando tem de virar recusa explícita, não
 * `undefined` atravessando até um `.map` estourar.
 */
export class DeliveryClientResponseError extends Error {
  public constructor() {
    super('DELIVERY_CLIENT_RESPONSE_INVALID')
    this.name = 'DeliveryClientResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new DeliveryClientResponseError()
  return value
}

function readOptionalText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return readString(value)
}

function toClient(value: unknown): DeliveryClient {
  if (!isRecord(value)) throw new DeliveryClientResponseError()
  if (typeof value.requiresScheduling !== 'boolean') throw new DeliveryClientResponseError()

  return {
    defaultServiceTimeMinutes:
      typeof value.defaultServiceTimeMinutes === 'number' ? value.defaultServiceTimeMinutes : null,
    deliveryFeeAmount: readNullableString(value.deliveryFeeAmount),
    displayName: readOptionalText(value.displayName),
    id: readString(value.id),
    notes: readOptionalText(value.notes),
    requiresScheduling: value.requiresScheduling,
    status: readString(value.status) === 'inactive' ? 'inactive' : 'active',
    taxId: readString(value.taxId),
  }
}

function toWindow(value: unknown): DeliveryWindow {
  if (!isRecord(value) || typeof value.weekday !== 'number') throw new DeliveryClientResponseError()

  return {
    closesAt: readString(value.closesAt),
    opensAt: readString(value.opensAt),
    weekday: value.weekday,
  }
}

function toException(value: unknown): DeliveryException {
  if (!isRecord(value)) throw new DeliveryClientResponseError()

  return {
    closesAt: readNullableString(value.closesAt),
    exceptionOn: readString(value.exceptionOn),
    kind: readString(value.kind) === 'open' ? 'open' : 'closed',
    opensAt: readNullableString(value.opensAt),
  }
}

export function toDeliveryClientPage(payload: unknown): DeliveryClientPage {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new DeliveryClientResponseError()
  const page = isRecord(payload.page) ? payload.page : {}

  return {
    items: payload.data.map(toClient),
    nextCursor: readNullableString(page.nextCursor),
  }
}

export function toDeliveryClientDetail(payload: unknown): DeliveryClientDetail {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new DeliveryClientResponseError()
  const data = payload.data
  if (!Array.isArray(data.windows) || !Array.isArray(data.exceptions)) {
    throw new DeliveryClientResponseError()
  }

  return {
    ...toClient(data),
    exceptions: data.exceptions.map(toException),
    windows: data.windows.map(toWindow),
  }
}

export function toDeliveryWindows(payload: unknown): readonly DeliveryWindow[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new DeliveryClientResponseError()
  return payload.data.map(toWindow)
}

export function toDeliveryExceptions(payload: unknown): readonly DeliveryException[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new DeliveryClientResponseError()
  return payload.data.map(toException)
}
