/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5, ADR-0067: o escritório dá baixa em nome do motorista. As rotas espelham as do
 * motorista (`me-trip.routes.ts`), com o `tripId` no caminho — porque quem acha a viagem é a
 * empresa do contexto, nunca um vínculo de motorista logado. Permissão própria,
 * `trip.report-on-behalf`, nunca `trip.manage` (separador) nem `trip.report` (rotas `/me`).
 *
 * Todas chamam os mesmos casos de uso da T3 com `{ target }` — o alvo já resolvido pela empresa,
 * nunca pelo motorista — e a autoria (`channel: 'office'`, `onBehalfOfDriverId`) nasce sozinha
 * disso (`deriveFieldAuthorship`). Cada ação grava em `audit_logs`: é ação sensível, ela encerra
 * entrega que outra pessoa fez.
 */
import { resolveClientIp } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import type { OfficeAuditRequest } from '../application/trip-field-office-audit.port.js'
import type { FieldTripTargetPort } from '../application/field-trip-target.port.js'
import {
  FIELD_TRIP_TARGET_KIND,
  type ResolvedTripFieldTarget,
  type TripFieldTripTarget,
} from '../application/field-trip-target.types.js'
import { resolveFieldTripTarget } from '../application/resolve-field-trip-target.use-case.js'
import type { DriverReturnReason } from '../domain/driver-return-reason.policy.js'
import {
  FIELD_TRIP_STEP,
  type FieldTripStep,
  type StartFieldTripResult,
} from '../application/start-field-trip.use-case.js'
import type {
  OfficeDeliveryProofUpload,
  OfficeProofPersistResult,
} from '../application/office-delivery-proof.service.js'
import type { ReportDocumentOutcomeResult } from '../application/report-document-delivery.use-case.js'
import type { ReportStopArrivalResult } from '../application/report-stop-arrival.use-case.js'
import type { ReportStopOccurrenceResult } from '../application/report-stop-occurrence.use-case.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../domain/trip-permission.constant.js'
import { parseIdempotencyKey } from './me-trip.schema.js'
import {
  parseOfficeFieldDeliveryRequest,
  parseOfficeFieldProofRequest,
} from './office-field-delivery.schema.js'
import {
  parseOfficeArrivalRequest,
  parseOfficeDriverSelection,
  parseOfficeFieldReturnRequest,
  parseOfficeStopOccurrenceRequest,
} from './trip-field-office.schema.js'

export const OFFICE_TRIP_PATH = `${API_TRIPS_PATH}/:id`
const OFFICE_CONFIRM_LOAD_PATH = `${OFFICE_TRIP_PATH}/confirm-load`
const OFFICE_START_ROUTE_PATH = `${OFFICE_TRIP_PATH}/start-route`
const OFFICE_STOP_ARRIVE_PATH = `${OFFICE_TRIP_PATH}/stops/:stopId/arrive`
const OFFICE_STOP_OCCURRENCES_PATH = `${OFFICE_TRIP_PATH}/stops/:stopId/occurrences`
const OFFICE_DOCUMENT_PATH = `${OFFICE_TRIP_PATH}/documents/:documentId`
const OFFICE_DOCUMENT_DELIVER_PATH = `${OFFICE_DOCUMENT_PATH}/field-delivery`
const OFFICE_DOCUMENT_RETURN_PATH = `${OFFICE_DOCUMENT_PATH}/field-return`
const OFFICE_DOCUMENT_PROOF_PATH = `${OFFICE_DOCUMENT_PATH}/field-proof`

const OFFICE_AUDIT_ACTION = {
  arrive: 'trip_field_office.stop_arrive',
  confirmLoad: 'trip_field_office.confirm_load',
  deliver: 'trip_field_office.document_deliver',
  occurrence: 'trip_field_office.stop_occurrence',
  proof: 'trip_field_office.document_proof',
  return: 'trip_field_office.document_return',
  startRoute: 'trip_field_office.start_route',
} as const

/**
 * Spec 156 T15 (seg M2): as escritas do escritório contam no Postgres, entre réplicas, por empresa
 * e usuário (`scope` é o balde). A baixa de nota aguenta o maço de canhotos (concorrência 3 no
 * cliente); as ações de viagem e parada são poucas por viagem.
 */
const OFFICE_TRIP_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'trip-field-office-trip',
  store: 'postgres',
  windowSeconds: 300,
} as const

const OFFICE_DOCUMENT_RATE_LIMIT = {
  maxRequests: 300,
  scope: 'trip-field-office-documents',
  store: 'postgres',
  windowSeconds: 300,
} as const

/**
 * A baixa do escritório é permissão própria (ADR-0067 §1): nem `trip.manage` (o separador a tem,
 * e ele não reporta entrega), nem `trip.report` (é a chave das rotas `/me`, que acham a viagem
 * pelo vínculo do motorista logado).
 */
export const OFFICE_REPORT_POLICY = {
  permission: TRIP_REPORT_ON_BEHALF_PERMISSION,
  scope: 'company',
} as const

type OfficeContextInput = {
  readonly actorUserId: string
  readonly companyId: string
  /** Spec 156 T15 M11: a trilha nasce na transação da ação, no caso de uso — não depois, aqui. */
  readonly officeAudit: OfficeAuditRequest
}

export type TripFieldOfficeDependencies = {
  readonly attachProof: (
    input: OfficeContextInput & {
      readonly documentId: string
      readonly idempotencyKey: string
      readonly proof: OfficeDeliveryProofUpload
      readonly target: ResolvedTripFieldTarget
    },
  ) => Promise<OfficeProofPersistResult>
  readonly reportArrival: (
    input: OfficeContextInput & {
      /** ADR-0067 §3, spec 156 T15 A1: quando a chegada aconteceu, já validada contra a janela. */
      readonly arrivedAt: Date
      readonly idempotencyKey: string
      readonly stopId: string
      readonly target: ResolvedTripFieldTarget
    },
  ) => Promise<ReportStopArrivalResult>
  readonly reportDelivery: (
    input: OfficeContextInput & {
      readonly deliveredAt: Date
      readonly documentId: string
      readonly idempotencyKey: string
      readonly proof: OfficeDeliveryProofUpload | null
      readonly target: ResolvedTripFieldTarget
    },
  ) => Promise<ReportDocumentOutcomeResult>
  readonly reportOccurrence: (
    input: OfficeContextInput & {
      readonly description: string
      readonly distanceMeters: number | null
      readonly documentId: string | null
      readonly idempotencyKey: string
      readonly kind: TripStopOccurrenceKind
      readonly stopId: string
      readonly target: ResolvedTripFieldTarget
    },
  ) => Promise<ReportStopOccurrenceResult>
  readonly reportReturn: (
    input: OfficeContextInput & {
      readonly documentId: string
      readonly idempotencyKey: string
      readonly reason: DriverReturnReason
      readonly returnedAt: Date
      readonly target: ResolvedTripFieldTarget
    },
  ) => Promise<ReportDocumentOutcomeResult>
  readonly startFieldTrip: (
    input: OfficeContextInput & {
      readonly step: FieldTripStep
      readonly target: ResolvedTripFieldTarget
    },
  ) => Promise<StartFieldTripResult>
  readonly targets: FieldTripTargetPort
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

/**
 * Viagem de outra empresa ou inexistente responde 404 `TRIP_NOT_FOUND` (ADR-0067 §2, isolamento);
 * sem motorista, 422 `TRIP_WITHOUT_DRIVER`; `driverId` fora da tripulação, 422 `DRIVER_NOT_ON_TRIP`
 * — as três decisões são de `resolveFieldTripTarget`/`pickOnBehalfOfDriver`, não desta rota.
 */
export async function resolveOfficeTarget(input: {
  readonly companyId: string
  readonly driverId: string | undefined
  readonly targets: FieldTripTargetPort
  readonly tripId: string
}): Promise<ResolvedTripFieldTarget> {
  const target: TripFieldTripTarget =
    input.driverId === undefined
      ? { kind: FIELD_TRIP_TARGET_KIND.trip, tripId: input.tripId }
      : { driverId: input.driverId, kind: FIELD_TRIP_TARGET_KIND.trip, tripId: input.tripId }

  return resolveFieldTripTarget({
    companyId: input.companyId,
    repository: input.targets,
    target,
  })
}

export function createTripFieldOfficeRoutes(
  dependencies: TripFieldOfficeDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    ...([FIELD_TRIP_STEP.confirmLoad, FIELD_TRIP_STEP.startRoute] as const).map((step) =>
      defineRoute<{
        readonly correlationId: string
        readonly driverId: string | undefined
        readonly ipAddress: string
        readonly tripId: string
      }>({
        /** `200`, e não `201`: nenhum recurso nasce aqui — espelha `TRIP_CONFIRM_LOAD_PATH`. */
        async handle({ context, input }): Promise<Response> {
          const target = await resolveOfficeTarget({
            companyId: context.scope.companyId,
            driverId: input.driverId,
            targets: dependencies.targets,
            tripId: input.tripId,
          })
          const result = await dependencies.startFieldTrip({
            officeAudit: {
              action:
                step === FIELD_TRIP_STEP.confirmLoad
                  ? OFFICE_AUDIT_ACTION.confirmLoad
                  : OFFICE_AUDIT_ACTION.startRoute,
              correlationId: input.correlationId,
              ipAddress: input.ipAddress,
            },
            actorUserId: context.scope.userId,
            companyId: context.scope.companyId,
            step,
            target,
          })

          return jsonResponse({
            body: { data: { changed: result.changed, status: result.tripStatus } },
            status: 200,
          })
        },
        method: 'POST',
        async parse({ correlationId, pathParameters, request }) {
          const body = await parseOfficeDriverSelection(request)
          return {
            correlationId,
            driverId: body.driverId,
            ipAddress: resolveClientIp(request),
            tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          }
        },
        pathname:
          step === FIELD_TRIP_STEP.confirmLoad ? OFFICE_CONFIRM_LOAD_PATH : OFFICE_START_ROUTE_PATH,
        policy: OFFICE_REPORT_POLICY,
        rateLimit: OFFICE_TRIP_RATE_LIMIT,
      }),
    ),
    defineRoute<{
      readonly arrivedAt: Date
      readonly correlationId: string
      readonly driverId: string | undefined
      readonly idempotencyKey: string
      readonly ipAddress: string
      readonly stopId: string
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const target = await resolveOfficeTarget({
          companyId: context.scope.companyId,
          driverId: input.driverId,
          targets: dependencies.targets,
          tripId: input.tripId,
        })
        const result = await dependencies.reportArrival({
          officeAudit: {
            action: OFFICE_AUDIT_ACTION.arrive,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
          },
          actorUserId: context.scope.userId,
          arrivedAt: input.arrivedAt,
          companyId: context.scope.companyId,
          idempotencyKey: input.idempotencyKey,
          stopId: input.stopId,
          target,
        })

        return jsonResponse({ body: { data: { id: result.id } }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseOfficeArrivalRequest(request)
        return {
          arrivedAt: body.arrivedAt ?? new Date(),
          correlationId,
          driverId: body.driverId,
          idempotencyKey: parseIdempotencyKey(request),
          ipAddress: resolveClientIp(request),
          stopId: parseUuidPathIdentifier(pathParameters.stopId ?? ''),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OFFICE_STOP_ARRIVE_PATH,
      policy: OFFICE_REPORT_POLICY,
      rateLimit: OFFICE_TRIP_RATE_LIMIT,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly description: string
      readonly distanceMeters: number | null
      readonly documentId: string | null
      readonly driverId: string | undefined
      readonly idempotencyKey: string
      readonly ipAddress: string
      readonly kind: TripStopOccurrenceKind
      readonly stopId: string
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const target = await resolveOfficeTarget({
          companyId: context.scope.companyId,
          driverId: input.driverId,
          targets: dependencies.targets,
          tripId: input.tripId,
        })
        const result = await dependencies.reportOccurrence({
          officeAudit: {
            action: OFFICE_AUDIT_ACTION.occurrence,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
          },
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          description: input.description,
          distanceMeters: input.distanceMeters,
          documentId: input.documentId,
          idempotencyKey: input.idempotencyKey,
          kind: input.kind,
          stopId: input.stopId,
          target,
        })

        return jsonResponse({ body: { data: { id: result.id } }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseOfficeStopOccurrenceRequest(request)
        return {
          correlationId,
          description: body.description,
          distanceMeters: body.distanceMeters,
          documentId: body.documentId,
          driverId: body.driverId,
          idempotencyKey: parseIdempotencyKey(request),
          ipAddress: resolveClientIp(request),
          kind: body.kind,
          stopId: parseUuidPathIdentifier(pathParameters.stopId ?? ''),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OFFICE_STOP_OCCURRENCES_PATH,
      policy: OFFICE_REPORT_POLICY,
      rateLimit: OFFICE_TRIP_RATE_LIMIT,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly deliveredAt: Date
      readonly documentId: string
      readonly driverId: string | undefined
      readonly idempotencyKey: string
      readonly ipAddress: string
      readonly proof: OfficeDeliveryProofUpload | null
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const target = await resolveOfficeTarget({
          companyId: context.scope.companyId,
          driverId: input.driverId,
          targets: dependencies.targets,
          tripId: input.tripId,
        })
        const result = await dependencies.reportDelivery({
          officeAudit: {
            action: OFFICE_AUDIT_ACTION.deliver,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
          },
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          deliveredAt: input.deliveredAt,
          documentId: input.documentId,
          idempotencyKey: input.idempotencyKey,
          proof: input.proof,
          target,
        })

        return jsonResponse({
          body: {
            data: {
              alreadySettled: result.alreadySettled,
              id: result.id,
              proofId: result.proofId,
              stopCompleted: result.stopCompleted,
              tripCompleted: result.tripCompleted,
            },
          },
          status: 201,
        })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseOfficeFieldDeliveryRequest(request)
        return {
          correlationId,
          deliveredAt: body.deliveredAt,
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          driverId: body.driverId,
          idempotencyKey: parseIdempotencyKey(request),
          ipAddress: resolveClientIp(request),
          proof: body.proof,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OFFICE_DOCUMENT_DELIVER_PATH,
      policy: OFFICE_REPORT_POLICY,
      rateLimit: OFFICE_DOCUMENT_RATE_LIMIT,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly documentId: string
      readonly driverId: string | undefined
      readonly idempotencyKey: string
      readonly ipAddress: string
      readonly reason: DriverReturnReason
      readonly returnedAt: Date
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const target = await resolveOfficeTarget({
          companyId: context.scope.companyId,
          driverId: input.driverId,
          targets: dependencies.targets,
          tripId: input.tripId,
        })
        const result = await dependencies.reportReturn({
          officeAudit: {
            action: OFFICE_AUDIT_ACTION.return,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
          },
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          documentId: input.documentId,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          returnedAt: input.returnedAt,
          target,
        })

        return jsonResponse({
          body: {
            data: {
              alreadySettled: result.alreadySettled,
              id: result.id,
              stopCompleted: result.stopCompleted,
              tripCompleted: result.tripCompleted,
            },
          },
          status: 201,
        })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseOfficeFieldReturnRequest(request)
        return {
          correlationId,
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          driverId: body.driverId,
          idempotencyKey: parseIdempotencyKey(request),
          ipAddress: resolveClientIp(request),
          reason: body.reason,
          returnedAt: body.returnedAt ?? new Date(),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OFFICE_DOCUMENT_RETURN_PATH,
      policy: OFFICE_REPORT_POLICY,
      rateLimit: OFFICE_DOCUMENT_RATE_LIMIT,
    }),
    /**
     * Anexa a uma entrega **já feita** (ADR-0067 §2): não cria evento, não muda `delivered_at`.
     * Exige `Idempotency-Key`, reservada em `trip_field_reports` com a operação
     * `office.document.proof` (spec 156 T6); o unique `(company, stop_event, kind)` é o que faz o
     * canhoto novo do escritório substituir o anterior do escritório.
     */
    defineRoute<{
      readonly correlationId: string
      readonly documentId: string
      readonly driverId: string | undefined
      readonly idempotencyKey: string
      readonly ipAddress: string
      readonly proof: OfficeDeliveryProofUpload
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const target = await resolveOfficeTarget({
          companyId: context.scope.companyId,
          driverId: input.driverId,
          targets: dependencies.targets,
          tripId: input.tripId,
        })
        const result = await dependencies.attachProof({
          officeAudit: {
            action: OFFICE_AUDIT_ACTION.proof,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
          },
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          documentId: input.documentId,
          idempotencyKey: input.idempotencyKey,
          proof: input.proof,
          target,
        })

        return jsonResponse({ body: { data: { id: result.id } }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseOfficeFieldProofRequest(request)
        return {
          correlationId,
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          driverId: body.driverId,
          idempotencyKey: parseIdempotencyKey(request),
          ipAddress: resolveClientIp(request),
          proof: body.proof,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OFFICE_DOCUMENT_PROOF_PATH,
      policy: OFFICE_REPORT_POLICY,
      rateLimit: OFFICE_DOCUMENT_RATE_LIMIT,
    }),
  ]
}
