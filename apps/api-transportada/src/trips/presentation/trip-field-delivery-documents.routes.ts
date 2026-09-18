/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T14, ADR-0069 §3 (pendência registrada na validação da T13, `b1653f25`): a leitura do
 * canhoto por OCR só casa pela chave inteira quando a lista de notas da viagem traz `accessKey` —
 * e `GET /trips/:id` não traz (ressalva M1 do t7-design.md: o validador do frontend recusa chave
 * desconhecida numa aba com bundle antigo). Rota própria, estreita, mesma permissão de quem dá a
 * baixa — molde de `trip-field-delivery-settings.routes.ts` e de `GET /trips/:id/allowed-actions`.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { TripFieldDeliveryDocument } from '../infrastructure/trip-field-delivery-documents.query.js'
import { OFFICE_REPORT_POLICY } from './trip-field-office.routes.js'

export const TRIP_FIELD_DELIVERY_DOCUMENTS_PATH = `${API_TRIPS_PATH}/:id/field-delivery-documents`

export type TripFieldDeliveryDocumentsDependencies = {
  readonly readFieldDeliveryDocuments: (input: {
    readonly companyId: string
    readonly tripId: string
  }) => Promise<readonly TripFieldDeliveryDocument[]>
}

function serializeFieldDeliveryDocument(document: TripFieldDeliveryDocument): object {
  return {
    accessKey: document.accessKey,
    id: document.id,
    nfeNumber: document.nfeNumber,
    nfeSeries: document.nfeSeries,
    releasedAt: document.releasedAt,
  }
}

export function createTripFieldDeliveryDocumentsRoutes(
  dependencies: TripFieldDeliveryDocumentsDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const documents = await dependencies.readFieldDeliveryDocuments({
          companyId: context.scope.companyId,
          tripId: input.tripId,
        })
        return new Response(
          JSON.stringify({ data: { documents: documents.map(serializeFieldDeliveryDocument) } }),
          {
            headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
            status: 200,
          },
        )
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_FIELD_DELIVERY_DOCUMENTS_PATH,
      policy: OFFICE_REPORT_POLICY,
    }),
  ]
}
