/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CargoLayoutRequestPort } from './cargo-layout-request.port.js'
import type {
  ReopenCargoLayoutUseCase,
  ReopenStoredCargoLayoutParams,
  UpsertCargoLayoutRequestResult,
} from './cargo-layout-request.types.js'

/**
 * Spec 145 T11 (D16/D18): a pergunta de novo reabre o pedido parado ou falho além da espera. Quem
 * decide reabrir é o upsert (G006), na mesma transação que grava o outbox.
 */
export function createReopenCargoLayoutUseCase(dependencies: {
  readonly repository: CargoLayoutRequestPort
}): ReopenCargoLayoutUseCase {
  return {
    execute(
      params: ReopenStoredCargoLayoutParams,
    ): Promise<UpsertCargoLayoutRequestResult | undefined> {
      return dependencies.repository.reopenStoredLayout(params)
    },
  }
}
