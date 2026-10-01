/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-D1: a precedência "o mais específico vence" — destinatário vence contratante vence
 * geral vence padrão de fábrica — escrita uma vez e reaproveitada por comprovante (RF-C3) e
 * ocorrência (RF-B2). Nenhum dos dois reimplementa `a ?? b ?? c ?? d` com as próprias palavras.
 */
export type ResolveWithOverridesParams<TValue> = {
  readonly general: TValue | null
  readonly contractorOverride: TValue | null
  readonly recipientOverride: TValue | null
  readonly fallback: TValue
}

export function resolveWithOverrides<TValue>(params: ResolveWithOverridesParams<TValue>): TValue {
  return params.recipientOverride ?? params.contractorOverride ?? params.general ?? params.fallback
}
