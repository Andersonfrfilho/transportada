/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PickupRequestStatus } from '../../database/pickup-request.schema.js'

/** Spec 339 D9: sem decisão em 7 dias corridos o pedido expira (igual à validade do orçamento). */
export const PICKUP_REQUEST_EXPIRY_DAYS = 7

/** Spec 339 D9: o escritório é alertado se o pedido ficar um dia útil sem resposta. */
export const PICKUP_REQUEST_STALE_ALERT_HOURS = 24

/** O teto do que uma janela pode pedir à frente: pedido para daqui a um ano não é pedido, é engano. */
export const PICKUP_REQUEST_MAX_WINDOW_DAYS_AHEAD = 180

/**
 * Máquina de estados do pedido. Cancelar é do cliente e só vale antes de aceito; encaixar e desfazer o
 * encaixe (viagem cancelada) são do escritório; `done` e os terminais não voltam.
 */
const TRANSITIONS: Readonly<Record<PickupRequestStatus, readonly PickupRequestStatus[]>> = {
  accepted: ['scheduled'],
  canceled: [],
  done: [],
  expired: [],
  refused: [],
  requested: ['accepted', 'refused', 'canceled', 'expired'],
  scheduled: ['accepted', 'done'],
}

export function canTransitionPickupRequest(
  from: PickupRequestStatus,
  to: PickupRequestStatus,
): boolean {
  return TRANSITIONS[from].includes(to)
}

export function computePickupRequestExpiry(now: Date): Date {
  return new Date(now.getTime() + PICKUP_REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
}

/** Pedido aberto há mais de 24 h e ainda sem alerta — candidato ao aviso ao escritório. */
export function isPickupRequestStale(input: {
  readonly alertedAt: Date | null
  readonly createdAt: Date
  readonly now: Date
  readonly status: PickupRequestStatus
}): boolean {
  if (input.status !== 'requested' || input.alertedAt !== null) return false
  return (
    input.now.getTime() - input.createdAt.getTime() >=
    PICKUP_REQUEST_STALE_ALERT_HOURS * 60 * 60 * 1000
  )
}

/**
 * A janela pedida tem de começar hoje ou depois e caber no teto. Datas são `YYYY-MM-DD` e a
 * comparação é de texto, que ordena igual a data — sem fuso no meio.
 */
export function isPickupWindowAcceptable(input: {
  readonly end: string
  readonly start: string
  readonly today: string
}): boolean {
  if (input.end < input.start || input.start < input.today) return false
  const limit = new Date(`${input.today}T00:00:00.000Z`)
  limit.setUTCDate(limit.getUTCDate() + PICKUP_REQUEST_MAX_WINDOW_DAYS_AHEAD)
  return input.end <= limit.toISOString().slice(0, 10)
}
