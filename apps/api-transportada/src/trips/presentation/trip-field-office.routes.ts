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
import type { TripFieldOfficeAuditPort } from '../application/trip-field-office-audit.port.js'
import type { FieldTripTargetPort } from '../application/field-trip-target.port.js'
import {
  FIELD_TRIP_TARGET_KIND,
  type ResolvedTripFieldTarget,
  type TripFieldTripTarget,
} from '../application/field-trip-target.types.js'
import { resolveFieldTripTarget } from '../application/resolve-field-trip-target.use-case.js'
import {
  FIELD_TRIP_STEP,
  type FieldTripStep,
  type StartFieldTripResult,
} from '../application/start-field-trip.use-case.js'
import type { ReportStopArrivalResult } from '../application/report-stop-arrival.use-case.js'
import type { ReportStopOccurrenceResult } from '../application/report-stop-occurrence.use-case.js'
import { parseIdempotencyKey } from './me-trip.schema.js'
import {
  parseOfficeDriverSelection,
  parseOfficeStopOccurrenceRequest,
} from './trip-field-office.schema.js'

const OFFICE_TRIP_PATH = `${API_TRIPS_PATH}/:id`
const OFFICE_CONFIRM_LOAD_PATH = `${OFFICE_TRIP_PATH}/confirm-load`
const OFFICE_START_ROUTE_PATH = `${OFFICE_TRIP_PATH}/start-route`
const OFFICE_STOP_ARRIVE_PATH = `${OFFICE_TRIP_PATH}/stops/:stopId/arrive`
const OFFICE_STOP_OCCURRENCES_PATH = `${OFFICE_TRIP_PATH}/stops/:stopId/occurrences`

const OFFICE_AUDIT_ACTION = {
  arrive: 'trip_field_office.stop_arrive',
  confirmLoad: 'trip_field_office.confirm_load',
  occurrence: 'trip_field_office.stop_occurrence',
  startRoute: 'trip_field_office.start_route',
} as const

/**
 * A baixa do escritório é permissão própria (ADR-0067 §1): nem `trip.manage` (o separador a tem,
 * e ele não reporta entrega), nem `trip.report` (é a chave das rotas `/me`, que acham a viagem
 * pelo vínculo do motorista logado).
 */
const OFFICE_REPORT_POLICY = { permission: 'trip.report-on-behalf', scope: 'company' } as const

type OfficeContextInput = {
  readonly actorUserId: string
  readonly companyId: string
}

export type TripFieldOfficeDependencies = {
  readonly audit: TripFieldOfficeAuditPort
  readonly reportArrival: (
    input: OfficeContextInput & {
      readonly idempotencyKey: string
      readonly stopId: string
      readonly target: ResolvedTripFieldTarget
    },
  ) => Promise<ReportStopArrivalResult>
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
async function resolveOfficeTarget(input: {
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
            actorUserId: context.scope.userId,
            companyId: context.scope.companyId,
            step,
            target,
          })
          await dependencies.audit.record({
            action:
              step === FIELD_TRIP_STEP.confirmLoad
                ? OFFICE_AUDIT_ACTION.confirmLoad
                : OFFICE_AUDIT_ACTION.startRoute,
            actorUserId: context.scope.userId,
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            ipAddress: input.ipAddress,
            onBehalfOfDriverId: target.onBehalfOfDriverId,
            tripId: target.tripId,
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
      }),
    ),
    defineRoute<{
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
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          idempotencyKey: input.idempotencyKey,
          stopId: input.stopId,
          target,
        })
        await dependencies.audit.record({
          action: OFFICE_AUDIT_ACTION.arrive,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          ipAddress: input.ipAddress,
          onBehalfOfDriverId: target.onBehalfOfDriverId,
          tripId: target.tripId,
        })

        return jsonResponse({ body: { data: { id: result.id } }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseOfficeDriverSelection(request)
        return {
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
        await dependencies.audit.record({
          action: OFFICE_AUDIT_ACTION.occurrence,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          ipAddress: input.ipAddress,
          onBehalfOfDriverId: target.onBehalfOfDriverId,
          tripId: target.tripId,
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
    }),
  ]
}
