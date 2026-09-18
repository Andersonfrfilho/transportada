import { isRecord, isString } from './tripGuards.validation'

/**
 * Spec 156 T14, ADR-0069 §3: `GET /trips/:id` não traz `accessKey` (ressalva M1 do t7-design.md),
 * e o casamento do canhoto por chave inteira (fix `b1653f25`, T13) precisa dela. Rota própria e
 * estreita, mesma permissão de quem dá a baixa (`trip.report-on-behalf`).
 */
export const TRIP_FIELD_DELIVERY_DOCUMENTS_PATH = (tripId: string): string =>
  `/trips/${tripId}/field-delivery-documents`

export type FieldDeliveryOcrDocument = Readonly<{
  accessKey: null | string
  id: string
  nfeNumber: null | string
  nfeSeries: null | string
  releasedAt: null | string
}>

function isFieldDeliveryOcrDocument(value: unknown): value is FieldDeliveryOcrDocument {
  return (
    isRecord(value) &&
    isString(value['id']) &&
    (value['accessKey'] === null || isString(value['accessKey'])) &&
    (value['nfeNumber'] === null || isString(value['nfeNumber'])) &&
    (value['nfeSeries'] === null || isString(value['nfeSeries'])) &&
    (value['releasedAt'] === null || isString(value['releasedAt']))
  )
}

export type FieldDeliveryOcrDocumentsResponse = Readonly<{
  documents: readonly FieldDeliveryOcrDocument[]
}>

export function isFieldDeliveryOcrDocumentsResponse(
  value: unknown,
): value is FieldDeliveryOcrDocumentsResponse {
  return (
    isRecord(value) &&
    Array.isArray(value['documents']) &&
    value['documents'].every(isFieldDeliveryOcrDocument)
  )
}
