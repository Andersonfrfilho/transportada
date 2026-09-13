/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CargoLayoutRequestParams,
  UpsertCargoLayoutRequestResult,
} from './cargo-layout-request.types.js'

/**
 * Spec 145 D8/D14: o pedido de plano de carga é o upsert de G006 — reabre a linha `failed` e a
 * `queued`/`running` parada além do lease, é no-op nas demais e sempre grava o outbox junto do que
 * reabriu ou nasceu novo. O lease é da infraestrutura, injetado nela.
 */
export type CargoLayoutRequestPort = {
  requestLayout(params: CargoLayoutRequestParams): Promise<UpsertCargoLayoutRequestResult>
}
