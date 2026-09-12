/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildCargoLayoutInput, hashCargoLayoutInput } from '../domain/cargo-layout-hash.policy.js'
import type { CargoLayoutRequestPort } from './cargo-layout-request.port.js'
import type {
  RequestCargoLayoutParams,
  RequestCargoLayoutResult,
  RequestCargoLayoutUseCase,
} from './request-cargo-layout.types.js'

/**
 * Spec 145 D6/D8: monta o retrato canônico, resume no hash e delega o upsert-e-outbox ao
 * repositório — a decisão de reabrir, criar ou não fazer nada é de G006, na infraestrutura.
 */
export function createRequestCargoLayoutUseCase(dependencies: {
  readonly repository: CargoLayoutRequestPort
}): RequestCargoLayoutUseCase {
  return {
    async execute(params: RequestCargoLayoutParams): Promise<RequestCargoLayoutResult> {
      const input = buildCargoLayoutInput(params)
      const inputHash = hashCargoLayoutInput(input)

      return dependencies.repository.requestLayout({
        companyId: params.companyId,
        correlationId: params.correlationId,
        input,
        inputHash,
        policyVersion: input.policyVersion,
        tripId: params.tripId,
      })
    },
  }
}
