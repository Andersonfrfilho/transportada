/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  TRIP_DELIVERY_PROOF_CANHOTO_KIND,
  type TripDeliveryProofCanhotoReview,
  type TripDeliveryProofKind,
} from '../../database/trip.schema.js'

/**
 * Spec 220 RF24: o canhoto é o único comprovante que se confere — assinatura e foto da mercadoria
 * nascem fora da fila.
 *
 * ⚠️ O default da coluna é `not_applicable` e descreve o passado (T6.1, sem backfill). Quem insere
 * escreve o estado de propósito: confiar no default faria a conferência nascer inerte, com a fila
 * vazia para sempre e nada falhando.
 */
export function resolveInitialCanhotoReview(
  kind: TripDeliveryProofKind,
): TripDeliveryProofCanhotoReview {
  return kind === TRIP_DELIVERY_PROOF_CANHOTO_KIND ? 'pending' : 'not_applicable'
}

type CanhotoReviewReset = {
  readonly canhotoReadDocumentId: null
  readonly canhotoReadNumber: null
  readonly canhotoReadSeries: null
  readonly canhotoReadSource: null
  readonly canhotoReview: TripDeliveryProofCanhotoReview
  readonly canhotoReviewAt: null
  readonly canhotoReviewByUserId: null
  readonly canhotoReviewNote: null
  readonly canhotoReviewOrigin: null
  readonly canhotoReviewReason: null
}

/**
 * Spec 220 RF24: recaptura é canhoto novo, e o veredito antigo era da foto que saiu. Vale nos dois
 * canais e sem condição: o mesmo `attachmentKey` nunca alcança o `ON CONFLICT`, porque os dois
 * caminhos de captura devolvem o id já gravado antes do INSERT.
 *
 * ⚠️ O `DO UPDATE SET` desta tabela é denotativo — coluna ausente do objeto fica com o valor antigo,
 * como `receiver_document_envelope` e `late_registration` querem. A conferência é a primeira em que
 * o padrão correto é **apagar**, e por isso as dez colunas entram juntas, de um lugar só.
 */
export function buildCanhotoReviewReset(kind: TripDeliveryProofKind): CanhotoReviewReset {
  return {
    canhotoReadDocumentId: null,
    canhotoReadNumber: null,
    canhotoReadSeries: null,
    canhotoReadSource: null,
    canhotoReview: resolveInitialCanhotoReview(kind),
    canhotoReviewAt: null,
    canhotoReviewByUserId: null,
    canhotoReviewNote: null,
    canhotoReviewOrigin: null,
    canhotoReviewReason: null,
  }
}
