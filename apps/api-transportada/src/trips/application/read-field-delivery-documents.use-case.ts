/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T14, ADR-0069 §3: o recorte de nota que o assistente de OCR do canhoto usa para casar
 * pela chave inteira — mesmo molde de `read-trip-action-snapshot.use-case.ts`.
 */
import { TripNotFoundError } from '../domain/trip.error.js'
import type { TripFieldDeliveryDocument } from './trip-field-delivery-documents.types.js'

export type FieldDeliveryDocumentsPort = {
  readTripFieldDeliveryDocuments(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripFieldDeliveryDocument[] | null>
}

export type ReadFieldDeliveryDocumentsParams = {
  readonly companyId: string
  readonly repository: FieldDeliveryDocumentsPort
  readonly tripId: string
}

export async function readFieldDeliveryDocuments(
  params: ReadFieldDeliveryDocumentsParams,
): Promise<readonly TripFieldDeliveryDocument[]> {
  const documents = await params.repository.readTripFieldDeliveryDocuments({
    companyId: params.companyId,
    tripId: params.tripId,
  })
  if (documents === null) throw new TripNotFoundError()

  return documents
}
