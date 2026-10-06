/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverFieldReport } from './driverTrip.types'
import type { OccurrenceRegistrationHandlers } from './occurrenceDispatch.service'

export type DocumentOccurrenceReport = Extract<DriverFieldReport, { kind: 'documentOccurrence' }>

type DocumentOccurrenceInput = Parameters<
  OccurrenceRegistrationHandlers['enqueueDocumentOccurrence']
>[0]

/**
 * Spec 218 D3 + 226 + 246: o **único** item da fila de uma ocorrência de nota — as fotos e a
 * assinatura entram dentro dele (209 D1), nunca como itens ou anexos à parte. `productCode` vazio é
 * a nota inteira, o que o servidor lê como todos os itens dela.
 */
export function buildDocumentOccurrenceReport(input: {
  readonly idempotencyKey: string
  readonly occurrence: DocumentOccurrenceInput
}): DocumentOccurrenceReport {
  const { occurrence } = input
  return {
    documentId: occurrence.documentId,
    ...(occurrence.extraPhotos === undefined ? {} : { extraPhotos: occurrence.extraPhotos }),
    idempotencyKey: input.idempotencyKey,
    kind: 'documentOccurrence',
    location: null,
    note: occurrence.note,
    occurrenceTypeId: occurrence.occurrenceTypeId,
    occurrenceTypeName: occurrence.occurrenceTypeName,
    photo: occurrence.photo,
    productCode: '',
    ...(occurrence.signature === undefined ? {} : { signature: occurrence.signature }),
  }
}
