/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocumentDetail, TripStopDetail } from './trip.types'
import type { TripDocumentLabelSource } from './tripDocument.service'

/** Só o que a faixa da nota (`FieldDeliveryNoteBanner`) mostra — nunca CPF nem outro dado sensível. */
export type FieldDeliveryWizardDocument = Readonly<{
  city: string
  documentId: string
  nfeNumber?: null | string
  nfeSeries?: null | string
  recipientName: string
}>

export type BuildFieldDeliveryWizardDocumentsParams = Readonly<{
  documentIds: readonly string[]
  documents: readonly Pick<
    TripDocumentDetail,
    'contact' | 'id' | 'nfeNumber' | 'nfeSeries' | 'stopId'
  >[]
  stops: readonly Pick<TripStopDetail, 'id' | 'label'>[]
}>

/**
 * Spec 156 D5: um passo por nota, na ordem em que foram marcadas — a faixa da câmera mostra
 * número/série, destinatário e cidade. A cidade vem do rótulo da parada (mesmo texto que o resto
 * da tela já usa, `stop.label`); sem parada ou sem contato, o campo fica vazio em vez de quebrar o
 * passo.
 */
export function buildFieldDeliveryWizardDocuments({
  documentIds,
  documents,
  stops,
}: BuildFieldDeliveryWizardDocumentsParams): readonly FieldDeliveryWizardDocument[] {
  return documentIds.flatMap((documentId) => {
    const document = documents.find((candidate) => candidate.id === documentId)
    if (document === undefined) return []

    const stop = stops.find((candidate) => candidate.id === document.stopId)
    /** `exactOptionalPropertyTypes`: omitir a chave em vez de gravar `undefined` nela. */
    const nfeNumberInput = document.nfeNumber === undefined ? {} : { nfeNumber: document.nfeNumber }
    const nfeSeriesInput = document.nfeSeries === undefined ? {} : { nfeSeries: document.nfeSeries }
    return [
      {
        city: stop?.label ?? '',
        documentId: document.id,
        recipientName: document.contact?.name ?? '',
        ...nfeNumberInput,
        ...nfeSeriesInput,
      },
    ]
  })
}

/** `tripDocumentLabel` pede `TripDocumentLabelSource` — a nota do assistente não tem os outros
 * campos, só o que faz o número/série (`id` vira o `documentId` de queda quando não há número). */
export function toTripDocumentLabelSource(
  document: FieldDeliveryWizardDocument,
): TripDocumentLabelSource {
  const nfeNumberInput = document.nfeNumber === undefined ? {} : { nfeNumber: document.nfeNumber }
  const nfeSeriesInput = document.nfeSeries === undefined ? {} : { nfeSeries: document.nfeSeries }
  return {
    freightCalculationId: null,
    id: document.documentId,
    nfeDocumentId: null,
    ...nfeNumberInput,
    ...nfeSeriesInput,
  }
}
