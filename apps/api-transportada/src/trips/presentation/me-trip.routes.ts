/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { API_ME_CURRENT_TRIP_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import type { DeliveryProofUpload } from '../application/attach-delivery-proof.use-case.js'
import type { ReportedLocation } from '../application/driver-field-report.port.js'
import type {
  DriverTrip,
  FindCurrentDriverTripResult,
} from '../application/find-current-driver-trip.use-case.js'
import type { DriverReturnReason } from '../domain/driver-return-reason.policy.js'
import type { ReportDocumentOutcomeResult } from '../application/report-document-delivery.use-case.js'
import type { ReportStopArrivalResult } from '../application/report-stop-arrival.use-case.js'
import type { ReportStopOccurrenceResult } from '../application/report-stop-occurrence.use-case.js'
import { DriverNotRegisteredError } from '../domain/trip.error.js'
import { parseDeliveryProofUpload } from './delivery-proof.schema.js'
import {
  parseDocumentReturnRequest,
  parseFieldReportRequest,
  parseIdempotencyKey,
  parseStopOccurrenceRequest,
} from './me-trip.schema.js'

const STOP_ARRIVE_PATH = `${API_ME_CURRENT_TRIP_PATH}/stops/:stopId/arrive`
const STOP_OCCURRENCES_PATH = `${API_ME_CURRENT_TRIP_PATH}/stops/:stopId/occurrences`
const DOCUMENT_DELIVER_PATH = `${API_ME_CURRENT_TRIP_PATH}/documents/:documentId/deliver`
const DOCUMENT_RETURN_PATH = `${API_ME_CURRENT_TRIP_PATH}/documents/:documentId/return`
const DOCUMENT_PROOF_PATH = `${API_ME_CURRENT_TRIP_PATH}/documents/:documentId/proof`

/**
 * `trip.read` lê a viagem própria e `trip.report` reporta o que aconteceu na rua. Nenhum dos dois é
 * `trip.manage`: o motorista não monta viagem, não vincula nota e não mexe em frota.
 */
const DRIVER_READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const DRIVER_REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const

type DriverContextInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly driverId: string
}

type DriverActionInput = DriverContextInput & {
  readonly idempotencyKey: string
  readonly location: ReportedLocation | null
}

export type MeTripDependencies = {
  readonly findCurrentTrip: (input: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<FindCurrentDriverTripResult>
  readonly reportArrival: (
    input: DriverActionInput & { readonly stopId: string },
  ) => Promise<ReportStopArrivalResult>
  readonly reportDelivery: (
    input: DriverActionInput & { readonly documentId: string },
  ) => Promise<ReportDocumentOutcomeResult>
  readonly reportOccurrence: (
    input: DriverContextInput & {
      readonly description: string
      readonly documentId: string | null
      readonly idempotencyKey: string
      readonly kind: TripStopOccurrenceKind
      readonly stopId: string
    },
  ) => Promise<ReportStopOccurrenceResult>
  readonly reportReturn: (
    input: DriverActionInput & {
      readonly documentId: string
      readonly reason: DriverReturnReason
    },
  ) => Promise<ReportDocumentOutcomeResult>
  readonly attachProof: (
    input: DriverContextInput & { readonly documentId: string; readonly upload: DeliveryProofUpload },
  ) => Promise<{ readonly id: string }>
  /** `null` quando a conta autenticada não está ligada a nenhum cadastro de motorista. */
  readonly resolveDriverId: (input: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<string | null>
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeTrip(trip: DriverTrip) {
  return {
    id: trip.id,
    status: trip.status,
    stops: trip.stops,
    vehiclePlate: trip.vehiclePlate,
  }
}

export function createMeTripRoutes(
  dependencies: MeTripDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  async function resolveDriver(context: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<string> {
    const driverId = await dependencies.resolveDriverId(context)
    if (driverId === null) throw new DriverNotRegisteredError()

    return driverId
  }

  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const result = await dependencies.findCurrentTrip({
          companyId: context.scope.companyId,
          membershipId: context.scope.membershipId,
        })

        return jsonResponse({
          body: {
            data: {
              isRegisteredDriver: result.isRegisteredDriver,
              trips: result.trips.map(serializeTrip),
            },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: API_ME_CURRENT_TRIP_PATH,
      policy: DRIVER_READ_POLICY,
    }),
    defineRoute<{
      readonly idempotencyKey: string
      readonly location: ReportedLocation | null
      readonly stopId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const result = await dependencies.reportArrival({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          driverId,
          idempotencyKey: input.idempotencyKey,
          location: input.location,
          stopId: input.stopId,
        })

        return jsonResponse({ body: { data: { id: result.id } }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseFieldReportRequest(request)
        return {
          idempotencyKey: parseIdempotencyKey(request),
          location: body.location,
          stopId: parseUuidPathIdentifier(pathParameters.stopId ?? ''),
        }
      },
      pathname: STOP_ARRIVE_PATH,
      policy: DRIVER_REPORT_POLICY,
    }),
    defineRoute<{
      readonly documentId: string
      readonly idempotencyKey: string
      readonly location: ReportedLocation | null
    }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const result = await dependencies.reportDelivery({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          documentId: input.documentId,
          driverId,
          idempotencyKey: input.idempotencyKey,
          location: input.location,
        })

        return jsonResponse({ body: { data: result }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseFieldReportRequest(request)
        return {
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          idempotencyKey: parseIdempotencyKey(request),
          location: body.location,
        }
      },
      pathname: DOCUMENT_DELIVER_PATH,
      policy: DRIVER_REPORT_POLICY,
    }),
    defineRoute<{
      readonly documentId: string
      readonly idempotencyKey: string
      readonly location: ReportedLocation | null
      readonly reason: DriverReturnReason
    }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const result = await dependencies.reportReturn({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          documentId: input.documentId,
          driverId,
          idempotencyKey: input.idempotencyKey,
          location: input.location,
          reason: input.reason,
        })

        return jsonResponse({ body: { data: result }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseDocumentReturnRequest(request)
        return {
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          idempotencyKey: parseIdempotencyKey(request),
          location: body.location,
          reason: body.reason,
        }
      },
      pathname: DOCUMENT_RETURN_PATH,
      policy: DRIVER_REPORT_POLICY,
    }),
    /**
     * O comprovante anexa a uma entrega **que já aconteceu** — ele não é passo dela. Em 3G ruim,
     * esperar o arquivo para confirmar a entrega é perder a entrega, e a spec pede o contrário.
     */
    defineRoute<{ readonly documentId: string; readonly upload: DeliveryProofUpload }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const proof = await dependencies.attachProof({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          documentId: input.documentId,
          driverId,
          upload: input.upload,
        })

        return jsonResponse({ body: { data: { id: proof.id } }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          upload: await parseDeliveryProofUpload(request),
        }
      },
      pathname: DOCUMENT_PROOF_PATH,
      policy: DRIVER_REPORT_POLICY,
    }),
    defineRoute<{
      readonly description: string
      readonly documentId: string | null
      readonly idempotencyKey: string
      readonly kind: TripStopOccurrenceKind
      readonly stopId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const result = await dependencies.reportOccurrence({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          description: input.description,
          documentId: input.documentId,
          driverId,
          idempotencyKey: input.idempotencyKey,
          kind: input.kind,
          stopId: input.stopId,
        })

        return jsonResponse({ body: { data: { id: result.id } }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseStopOccurrenceRequest(request)
        return {
          description: body.description,
          documentId: body.documentId,
          idempotencyKey: parseIdempotencyKey(request),
          kind: body.kind,
          stopId: parseUuidPathIdentifier(pathParameters.stopId ?? ''),
        }
      },
      pathname: STOP_OCCURRENCES_PATH,
      policy: DRIVER_REPORT_POLICY,
    }),
  ]
}
