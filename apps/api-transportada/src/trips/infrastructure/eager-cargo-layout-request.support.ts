/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D7: o gatilho eager que os use cases chamam como último passo da própria transação —
 * lê o retrato atual da viagem, hasheia (D6) e delega ao upsert idempotente de T5 (G006).
 *
 * ⚠️ `correlationId` ausente vira `crypto.randomUUID()` aqui: o contexto autenticado
 * (`CompanyContext`) só carrega `{companyId, userId}`, sem correlationId de request para repassar —
 * o `layoutId` devolvido é quem rastreia o pedido. O caminho lazy (T10/T11) lê o correlationId real
 * do request e o passa direto, sem gerar nada.
 */
import { randomUUID } from 'node:crypto'

import { canRequestCargoLayout } from '../domain/cargo-layout-availability.policy.js'
import {
  buildCargoLayoutInput,
  buildStoredCargoLayoutInput,
  hashCargoLayoutInput,
} from '../domain/cargo-layout-hash.policy.js'
import type {
  CargoLayoutLeaseOptions,
  UpsertCargoLayoutRequestResult,
} from '../application/cargo-layout-request.types.js'
import { upsertCargoLayoutRequest } from './cargo-layout-request.support.js'
import { readCargoLayoutInputParams } from './trip-cargo-layout-input.support.js'
import type { TripTransaction } from './trip-queryable.type.js'

export type RequestCargoLayoutForTripParams = {
  readonly companyId: string
  readonly correlationId?: string
  readonly tripId: string
}

type ReadCargoLayoutInputParams = typeof readCargoLayoutInputParams
type UpsertCargoLayoutRequest = typeof upsertCargoLayoutRequest

/** `null` é "nada a enfileirar": viagem ausente ou planta impossível (D15/D10 — `unavailable`). */
export type RequestCargoLayoutForTrip = (
  transaction: TripTransaction,
  params: RequestCargoLayoutForTripParams,
) => Promise<UpsertCargoLayoutRequestResult | null>

export function createEagerCargoLayoutRequest(dependencies: {
  readonly leaseMs: number
  readonly readInput: ReadCargoLayoutInputParams
  readonly upsert: UpsertCargoLayoutRequest
}): RequestCargoLayoutForTrip {
  return async function requestCargoLayoutForTrip(transaction, params) {
    const inputParams = await dependencies.readInput(transaction, {
      companyId: params.companyId,
      tripId: params.tripId,
    })
    if (inputParams === null) return null
    if (!canRequestCargoLayout(inputParams)) return null

    const input = buildStoredCargoLayoutInput(inputParams)
    const inputHash = hashCargoLayoutInput(buildCargoLayoutInput(inputParams))

    return dependencies.upsert(transaction, {
      companyId: params.companyId,
      correlationId: params.correlationId ?? randomUUID(),
      input,
      inputHash,
      leaseMs: dependencies.leaseMs,
      policyVersion: input.policyVersion,
      tripId: params.tripId,
    })
  }
}

export function createRequestCargoLayoutForTrip(
  options: CargoLayoutLeaseOptions,
): RequestCargoLayoutForTrip {
  return createEagerCargoLayoutRequest({
    leaseMs: options.cargoLayoutLeaseMs,
    readInput: readCargoLayoutInputParams,
    upsert: upsertCargoLayoutRequest,
  })
}
