/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T14, ADR-0069 §3: a nota da viagem que o assistente do canhoto casa pela chave. O tipo
 * mora na aplicação — a consulta (`trip-field-delivery-documents.query.ts`) o implementa, e a rota o
 * serializa (spec 156 T15: a aplicação não importa tipo da infraestrutura).
 */
export type TripFieldDeliveryDocument = {
  readonly accessKey: string | null
  readonly id: string
  readonly nfeNumber: string | null
  readonly nfeSeries: string | null
  readonly releasedAt: string | null
}
