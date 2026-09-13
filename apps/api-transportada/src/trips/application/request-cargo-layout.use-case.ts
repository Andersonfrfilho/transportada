/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { canRequestCargoLayout } from '../domain/cargo-layout-availability.policy.js'
import {
  buildCargoLayoutInput,
  buildStoredCargoLayoutInput,
  hashCargoLayoutInput,
} from '../domain/cargo-layout-hash.policy.js'
import type { CargoLayoutRequestPort } from './cargo-layout-request.port.js'
import type {
  CargoLayoutUnavailableResult,
  RequestCargoLayoutParams,
  RequestCargoLayoutResult,
  RequestCargoLayoutUseCase,
} from './request-cargo-layout.types.js'

const CARGO_LAYOUT_UNAVAILABLE_RESULT: CargoLayoutUnavailableResult = {
  enqueued: false,
  layoutId: null,
  status: 'unavailable',
}

/**
 * Spec 145 D6/D8: monta o retrato canônico, resume no hash e delega o upsert-e-outbox ao
 * repositório — a decisão de reabrir, criar ou não fazer nada é de G006, na infraestrutura.
 */
export function createRequestCargoLayoutUseCase(dependencies: {
  readonly repository: CargoLayoutRequestPort
}): RequestCargoLayoutUseCase {
  return {
    async execute(params: RequestCargoLayoutParams): Promise<RequestCargoLayoutResult> {
      if (!canRequestCargoLayout(params)) return CARGO_LAYOUT_UNAVAILABLE_RESULT

      const input = buildStoredCargoLayoutInput(params)
      const inputHash = hashCargoLayoutInput(buildCargoLayoutInput(params))

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
