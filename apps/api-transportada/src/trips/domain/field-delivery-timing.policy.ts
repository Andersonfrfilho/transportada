/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0067 §3: a baixa do escritório informa quando a entrega **aconteceu**, não quando foi
 * digitada. Regra pura, sem I/O — quem lê o início da janela é o repositório.
 */
import type { ApiError } from '../../shared/api.error.js'
import { DeliveredAtBeforeDispatchError, DeliveredAtInFutureError } from './trip.error.js'
import {
  ArrivedAtBeforeDispatchError,
  ArrivedAtInFutureError,
  ReturnedAtBeforeDispatchError,
  ReturnedAtInFutureError,
} from './trip-field-office.error.js'

/** Tolerância de relógio entre o aparelho de quem registra e o servidor. */
export const DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS = 2 * 60 * 1000

/** Qual hora foi informada — cada uma responde com o próprio código (spec 156 T15). */
export const FIELD_INFORMED_TIME = {
  arrived: 'arrived',
  delivered: 'delivered',
  returned: 'returned',
} as const

export type FieldInformedTime = (typeof FIELD_INFORMED_TIME)[keyof typeof FIELD_INFORMED_TIME]

const WINDOW_ERRORS: Record<
  FieldInformedTime,
  { readonly beforeDispatch: () => ApiError; readonly inFuture: () => ApiError }
> = {
  arrived: {
    beforeDispatch: () => new ArrivedAtBeforeDispatchError(),
    inFuture: () => new ArrivedAtInFutureError(),
  },
  delivered: {
    beforeDispatch: () => new DeliveredAtBeforeDispatchError(),
    inFuture: () => new DeliveredAtInFutureError(),
  },
  returned: {
    beforeDispatch: () => new ReturnedAtBeforeDispatchError(),
    inFuture: () => new ReturnedAtInFutureError(),
  },
}

export type AssertInformedTimeWithinWindowParams = {
  readonly informedAt: Date
  readonly kind: FieldInformedTime
  readonly now: Date
  /**
   * O despacho congelado da viagem; sem ele (viagem legada), a criação da viagem (spec 156 T15 M9).
   * `null` só quando a viagem sumiu — e aí quem recusa é a leitura da nota, não esta regra.
   */
  readonly windowStart: Date | null
}

/**
 * Lança `<KIND>_AT_IN_FUTURE` (400) para hora depois de agora (com tolerância), e
 * `<KIND>_AT_BEFORE_DISPATCH` (400) para hora antes do início da janela.
 */
export function assertInformedTimeWithinWindow(params: AssertInformedTimeWithinWindowParams): void {
  const errors = WINDOW_ERRORS[params.kind]
  const latestAllowed = params.now.getTime() + DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS
  if (params.informedAt.getTime() > latestAllowed) throw errors.inFuture()

  if (params.windowStart !== null && params.informedAt.getTime() < params.windowStart.getTime()) {
    throw errors.beforeDispatch()
  }
}
