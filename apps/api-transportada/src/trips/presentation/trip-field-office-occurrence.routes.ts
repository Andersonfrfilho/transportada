/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3: a ocorrência do escritório em nome do motorista — a lista de tipos de rua (L2) e o
 * lote (D7, aceite 10). Arquivo próprio para `trip-field-office.routes.ts` não crescer mais; a
 * política, o caminho e a resolução do alvo são os mesmos de lá.
 */
import { resolveClientIp } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { FieldTripTargetPort } from '../application/field-trip-target.port.js'
import type { ResolvedTripFieldTarget } from '../application/field-trip-target.types.js'
import type { FieldOccurrenceType } from '../application/list-field-occurrence-types.use-case.js'
import type { RegisterOfficeDocumentOccurrencesResult } from '../application/register-office-document-occurrences.use-case.js'
import type { OfficeAuditRequest } from '../application/trip-field-office-audit.port.js'
import { parseIdempotencyKey } from './me-trip.schema.js'
import {
  OFFICE_REPORT_POLICY,
  OFFICE_TRIP_PATH,
  resolveOfficeTarget,
} from './trip-field-office.routes.js'
import { parseOfficeFieldOccurrencesRequest } from './trip-field-office.schema.js'

const OFFICE_FIELD_OCCURRENCE_TYPES_PATH = `${API_TRIPS_PATH}/occurrence-types/field`
const OFFICE_DOCUMENT_OCCURRENCES_PATH = `${OFFICE_TRIP_PATH}/documents/field-occurrences`
const OFFICE_OCCURRENCES_AUDIT_ACTION = 'trip_field_office.document_occurrences'

export type TripFieldOfficeOccurrenceDependencies = {
  readonly listFieldOccurrenceTypes: (input: {
    readonly companyId: string
  }) => Promise<readonly FieldOccurrenceType[]>
  readonly registerOccurrences: (input: {
    readonly actorUserId: string
    readonly attachment: { readonly bytes: Uint8Array; readonly mimeType: string } | null
    readonly companyId: string
    readonly documentIds: readonly string[]
    readonly idempotencyKey: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly officeAudit: OfficeAuditRequest
    readonly target: ResolvedTripFieldTarget
  }) => Promise<RegisterOfficeDocumentOccurrencesResult>
  readonly targets: FieldTripTargetPort
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

export function createTripFieldOfficeOccurrenceRoutes(
  dependencies: TripFieldOfficeOccurrenceDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    /** L2: só `id` e `name` dos tipos ativos de rua — o e-mail do tipo é `settings.manage`. */
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const types = await dependencies.listFieldOccurrenceTypes({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ body: { data: types }, status: 200 })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: OFFICE_FIELD_OCCURRENCE_TYPES_PATH,
      policy: OFFICE_REPORT_POLICY,
    }),
    /**
     * D7: a mesma ocorrência de rua em várias notas, uma transação, uma `Idempotency-Key` por lote.
     * `201` com uma ocorrência por nota, na ordem do pedido; `audit_logs` numa linha, com as notas,
     * gravada na transação do lote (spec 156 T15 M11).
     */
    defineRoute<{
      readonly attachment: { readonly bytes: Uint8Array; readonly mimeType: string } | null
      readonly correlationId: string
      readonly documentIds: readonly string[]
      readonly driverId: string | undefined
      readonly idempotencyKey: string
      readonly ipAddress: string
      readonly note: string
      readonly occurrenceTypeId: string
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const target = await resolveOfficeTarget({
          companyId: context.scope.companyId,
          driverId: input.driverId,
          targets: dependencies.targets,
          tripId: input.tripId,
        })
        const result = await dependencies.registerOccurrences({
          actorUserId: context.scope.userId,
          attachment: input.attachment,
          companyId: context.scope.companyId,
          documentIds: input.documentIds,
          idempotencyKey: input.idempotencyKey,
          note: input.note,
          occurrenceTypeId: input.occurrenceTypeId,
          officeAudit: {
            action: OFFICE_OCCURRENCES_AUDIT_ACTION,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
          },
          target,
        })

        return jsonResponse({ body: { data: { items: result.items } }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseOfficeFieldOccurrencesRequest(request)
        return {
          attachment: body.attachment,
          correlationId,
          documentIds: body.documentIds,
          driverId: body.driverId,
          idempotencyKey: parseIdempotencyKey(request),
          ipAddress: resolveClientIp(request),
          note: body.note,
          occurrenceTypeId: body.occurrenceTypeId,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OFFICE_DOCUMENT_OCCURRENCES_PATH,
      policy: OFFICE_REPORT_POLICY,
    }),
  ]
}
