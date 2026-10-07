/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RegisterCargoArrivalInput } from './cargoArrival.types'

export type IdempotencyAttempt = Readonly<{ fingerprint: string; key: string }>

type FingerprintInput = Readonly<{
  arrivedAt: string
  contractorId: string
  documentIds: readonly string[]
  palletCount?: number | undefined
  reference?: string | undefined
}>

/** A ordem das notas não é conteúdo: a API também as ordena antes de comparar o pedido. */
export function buildRegistrationFingerprint(
  input: FingerprintInput | RegisterCargoArrivalInput,
): string {
  return JSON.stringify([
    input.contractorId,
    [...input.documentIds].sort(),
    input.arrivedAt,
    input.palletCount ?? null,
    input.reference ?? null,
  ])
}

/**
 * O MESMO envio repetido (duplo clique, nova tentativa depois de uma queda) reaproveita a chave, e a API
 * devolve a mesma chegada em vez de criar outra. Pedido diferente ganha chave nova: a API trata a mesma
 * chave com outro conteúdo como reuso (409).
 */
export function resolveIdempotencyAttempt(
  input: Readonly<{
    fingerprint: string
    generateKey: () => string
    previous: IdempotencyAttempt | undefined
  }>,
): IdempotencyAttempt {
  if (input.previous?.fingerprint === input.fingerprint) return input.previous
  return { fingerprint: input.fingerprint, key: input.generateKey() }
}
