/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0067 §3: a baixa do escritório informa quando a entrega **aconteceu**, não quando foi
 * digitada. Regra pura, sem I/O — quem lê `trip_dispatch_snapshots.dispatched_at` é o repositório.
 */
import { DeliveredAtBeforeDispatchError, DeliveredAtInFutureError } from './trip.error.js'

/** Tolerância de relógio entre o aparelho de quem registra e o servidor. */
export const DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS = 2 * 60 * 1000

export type AssertDeliveredAtWithinWindowParams = {
  readonly deliveredAt: Date
  /** `null` quando a viagem ainda não tem despacho congelado — não deveria acontecer aqui, mas não é esta regra que decide isso. */
  readonly dispatchedAt: Date | null
  readonly now: Date
}

/**
 * Lança `DELIVERED_AT_IN_FUTURE` (400) para hora depois de agora (com tolerância), e
 * `DELIVERED_AT_BEFORE_DISPATCH` (400) para hora antes do despacho congelado da viagem.
 */
export function assertDeliveredAtWithinWindow(params: AssertDeliveredAtWithinWindowParams): void {
  const latestAllowed = params.now.getTime() + DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS
  if (params.deliveredAt.getTime() > latestAllowed) throw new DeliveredAtInFutureError()

  if (
    params.dispatchedAt !== null &&
    params.deliveredAt.getTime() < params.dispatchedAt.getTime()
  ) {
    throw new DeliveredAtBeforeDispatchError()
  }
}
