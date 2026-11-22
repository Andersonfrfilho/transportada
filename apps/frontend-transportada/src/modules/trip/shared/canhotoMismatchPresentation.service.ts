/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5 (D8): do alerta "parece ser da NF X" que a API deriva ao que a tela diz. Puro: devolve
 * chaves de `deliveryProof.canhotoMismatch.*` e valores crus; o texto e o idioma são da tela. O
 * alerta é só aviso — nunca decide, e só vale enquanto o canhoto espera conferência.
 */
import type { CanhotoMismatch } from './canhotoMismatch.validation'
import type { DeliveryProof } from './deliveryProof.service'

export type CanhotoMismatchHeadlineKey = 'matched' | 'unknownWithSeries' | 'unknownWithoutSeries'

export type CanhotoMismatchDetailKey =
  | 'alreadyApproved'
  | 'otherTrip'
  | 'sameTrip'
  | 'statusCancelled'
  | 'statusDenied'
  | 'statusUnsigned'

export type CanhotoMismatchPresentation = Readonly<{
  details: readonly CanhotoMismatchDetailKey[]
  headlineKey: CanhotoMismatchHeadlineKey
  number: string
  series: string
}>

/** O alerta só vale no canhoto pendente: aprovado, recusado ou sem leitura não alerta (RF5). */
export function resolveCanhotoMismatch(proof: DeliveryProof): CanhotoMismatch | undefined {
  return proof.canhotoReview === 'pending' ? proof.canhotoMismatch : undefined
}

/** Prova sinalizada: fora do "aprovar todas" e só aprovada por clique próprio (D8.2). */
export function isCanhotoFlagged(proof: DeliveryProof): boolean {
  return resolveCanhotoMismatch(proof) !== undefined
}

function resolveStatusDetail(
  status: NonNullable<CanhotoMismatch['matchedDocument']>['status'],
): CanhotoMismatchDetailKey | undefined {
  switch (status) {
    case 'cancelled':
      return 'statusCancelled'
    case 'denied':
      return 'statusDenied'
    case 'unsigned':
      return 'statusUnsigned'
    case 'authorized':
      return undefined
  }
}

export function presentCanhotoMismatch(mismatch: CanhotoMismatch): CanhotoMismatchPresentation {
  const { matchedDocument, readNumber, readSeries } = mismatch
  if (matchedDocument === null) {
    return {
      details: [],
      headlineKey: readSeries === null ? 'unknownWithoutSeries' : 'unknownWithSeries',
      number: readNumber,
      series: readSeries ?? '',
    }
  }
  const statusDetail = resolveStatusDetail(matchedDocument.status)
  return {
    details: [
      matchedDocument.sameTrip ? 'sameTrip' : 'otherTrip',
      ...(statusDetail === undefined ? [] : [statusDetail]),
      ...(matchedDocument.canhotoApproved ? (['alreadyApproved'] as const) : []),
    ],
    headlineKey: 'matched',
    number: matchedDocument.number,
    series: matchedDocument.series,
  }
}
