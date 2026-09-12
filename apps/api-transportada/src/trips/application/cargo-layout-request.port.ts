/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  UpsertCargoLayoutRequestParams,
  UpsertCargoLayoutRequestResult,
} from './cargo-layout-request.types.js'

/**
 * Spec 145 D8: o pedido de plano de carga é o upsert de G006 — reabre a linha `failed`, é no-op
 * nas demais e sempre grava o outbox junto do que reabriu ou nasceu novo.
 */
export type CargoLayoutRequestPort = {
  requestLayout(params: UpsertCargoLayoutRequestParams): Promise<UpsertCargoLayoutRequestResult>
}
