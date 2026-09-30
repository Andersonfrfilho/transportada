/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Sobrevive ao fechar o item: os bytes do canhoto são imutáveis, então reabrir não relê. */
const settledProofIds = new Set<string>()

export function hasCanhotoReviewSettled(proofId: string): boolean {
  return settledProofIds.has(proofId)
}

export function markCanhotoReviewSettled(proofId: string): void {
  settledProofIds.add(proofId)
}
