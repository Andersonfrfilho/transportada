/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCanhotoReview } from '../hooks/useCanhotoReview.hook'
import type { TripWorkspaceController } from '../hooks/useTripWorkspace.hook'
import type { CanhotoTripDocument } from '../shared/canhotoIdentification.service'
import {
  CANHOTO_REVIEW_TIMEOUT_MS,
  type CanhotoReviewOutcome,
} from '../shared/canhotoReview.service'
import { readCanhotoFromUrl } from '../shared/canhotoReviewRead.service'
import { markCanhotoReviewSettled } from '../shared/canhotoReviewSession.service'
import type { DeliveryProof } from '../shared/deliveryProof.service'

export type CanhotoReadContext = Readonly<{
  canhotoOcrEnabled: boolean
  tripDocuments: readonly CanhotoTripDocument[]
}>

type CanhotoAutomaticReviewProps = Readonly<{
  context: CanhotoReadContext
  documentId: string
  proof: DeliveryProof
  reviewCanhoto: TripWorkspaceController['reviewCanhoto']
  tripId: string
}>

/** Não desenha nada: só liga a leitura automática ao item aberto. */
export function CanhotoAutomaticReview({
  context,
  documentId,
  proof,
  reviewCanhoto,
  tripId,
}: CanhotoAutomaticReviewProps): null {
  const accessKey = context.tripDocuments.find(
    (candidate) => candidate.id === documentId,
  )?.accessKey

  async function handleRead(outcome: CanhotoReviewOutcome): Promise<void> {
    markCanhotoReviewSettled(proof.id)
    try {
      await reviewCanhoto({
        documentId,
        review: {
          action: 'automatic',
          readDocumentId: outcome.readDocumentId,
          readNumber: outcome.readNumber,
          readSeries: outcome.readSeries,
          readSource: outcome.readSource,
        },
        tripId,
      })
    } catch {
      // O veredito automático é conferência, não portão: falhou, o comprovante segue pendente para gente.
    }
  }

  useCanhotoReview({
    accessKey: accessKey ?? undefined,
    deadlineMs: CANHOTO_REVIEW_TIMEOUT_MS,
    onRead: (outcome) => {
      void handleRead(outcome)
    },
    proof,
    readCanhoto: () =>
      readCanhotoFromUrl({
        canhotoOcrEnabled: context.canhotoOcrEnabled,
        documentId,
        downloadUrl: proof.downloadUrl,
        tripDocuments: context.tripDocuments,
      }),
  })

  return null
}
