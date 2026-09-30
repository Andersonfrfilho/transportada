/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 T7.11: leva a resposta do `PATCH .../proof/review` para a forma do `GET .../proof`, que é
 * a que o cache de `deliveryProofsQuery` guarda. O veredito mora no comprovante, não no documento:
 * só recebe quem já carrega `canhotoReview` (o canhoto; a assinatura e a foto da carga não têm a chave).
 */
import type { CanhotoReviewResult } from './canhotoReviewResult.service'
import { CANHOTO_REVIEW_NOT_APPLICABLE } from './canhotoReviewResult.service'
import type { DeliveryProof, DeliveryProofCanhotoReview } from './deliveryProof.service'

/** `canhotoReviewByName` entra na lista: o PATCH não o devolve, e o nome antigo não é de quem decidiu agora. */
const CANHOTO_VERDICT_KEYS: ReadonlySet<string> = new Set([
  'canhotoReadNumber',
  'canhotoReadSeries',
  'canhotoReadSource',
  'canhotoReview',
  'canhotoReviewAt',
  'canhotoReviewByName',
  'canhotoReviewNote',
  'canhotoReviewOrigin',
  'canhotoReviewReason',
])

type ApplicableCanhotoReviewResult = CanhotoReviewResult &
  Readonly<{ canhotoReview: DeliveryProofCanhotoReview }>

function isApplicable(result: CanhotoReviewResult): result is ApplicableCanhotoReviewResult {
  return result.canhotoReview !== CANHOTO_REVIEW_NOT_APPLICABLE
}

function withoutVerdict(proof: DeliveryProof): DeliveryProof {
  const entries = Object.entries(proof).filter(([key]) => !CANHOTO_VERDICT_KEYS.has(key))
  return Object.fromEntries(entries) as DeliveryProof
}

export function applyCanhotoReviewResult(
  proofs: readonly DeliveryProof[],
  result: CanhotoReviewResult,
): DeliveryProof[] {
  return proofs.map((proof) => {
    if (proof.canhotoReview === undefined) return proof
    const base = withoutVerdict(proof)
    return isApplicable(result) ? { ...base, ...result } : base
  })
}
