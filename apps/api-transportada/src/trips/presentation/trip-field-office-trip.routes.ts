/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5 (ADR-0067): as ações de viagem e de parada que o escritório registra em nome do
 * motorista — conferir a carga, iniciar o trajeto, chegar na parada e a ocorrência de parada.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { TripStopOccurrenceKind } from '../../database/trip.schema.js'
import type { FieldTripTargetPort } from '../application/field-trip-target.port.js'
import type { ResolvedTripFieldTarget } from '../application/field-trip-target.types.js'
import type { ReportStopArrivalResult } from '../application/report-stop-arrival.use-case.js'
import type { ReportStopOccurrenceResult } from '../application/report-stop-occurrence.use-case.js'
import {
  FIELD_TRIP_STEP,
  type FieldTripStep,
  type StartFieldTripResult,
} from '../application/start-field-trip.use-case.js'
import { parseIdempotencyKey } from './me-trip.schema.js'
import {
  parseOfficeArrivalRequest,
  parseOfficeDriverSelection,
  parseOfficeStopOccurrenceRequest,
} from './trip-field-office.schema.js'
import {
  buildOfficeContextInput,
  OFFICE_REPORT_POLICY,
  OFFICE_TRIP_PATH,
  officeJsonResponse,
  resolveOfficeTarget,
  type OfficeContextInput,
} from './trip-field-office.support.js'

const OFFICE_CONFIRM_LOAD_PATH = `${OFFICE_TRIP_PATH}/confirm-load`
const OFFICE_START_ROUTE_PATH = `${OFFICE_TRIP_PATH}/start-route`
const OFFICE_STOP_ARRIVE_PATH = `${OFFICE_TRIP_PATH}/stops/:stopId/arrive`
const OFFICE_STOP_OCCURRENCES_PATH = `${OFFICE_TRIP_PATH}/stops/:stopId/occurrences`

const OFFICE_TRIP_AUDIT_ACTION = {
  arrive: 'trip_field_office.stop_arrive',
  confirmLoad: 'trip_field_office.confirm_load',
  occurrence: 'trip_field_office.stop_occurrence',
  startRoute: 'trip_field_office.start_route',
} as const

/**
 * Spec 156 T15 (seg M2): as ações de viagem e parada contam no Postgres, entre réplicas, por
 * empresa e usuário — são poucas por viagem, então o balde fica no meio.
 */
const OFFICE_TRIP_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'trip-field-office-trip',
  store: 'postgres',
  windowSeconds: 300,
} as const

export type TripFieldOfficeTripDependencies = {
  /** ADR-0076 §6: o IP da trilha sai do salto conhecido, nunca do começo de `x-forwarded-for`. */
  readonly resolveClientIp: ClientIpResolver
  readonly reportArrival: (
    input: OfficeContextInput & {
      /** ADR-0067 §3, spec 156 T15 A1: quando a chegada aconteceu, já validada contra a janela. */
      readonly arrivedAt: Date
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

type OfficeRequestInput = {
  readonly correlationId: string
  readonly driverId: string | undefined
  readonly ipAddress: string
  readonly tripId: string
}

function createFieldStepRoute(params: {
  readonly dependencies: TripFieldOfficeTripDependencies
  readonly step: FieldTripStep
}): ReturnType<typeof defineRoute> {
  const { dependencies, step } = params
  const isConfirmLoad = step === FIELD_TRIP_STEP.confirmLoad

  return defineRoute<OfficeRequestInput>({
    /** `200`, e não `201`: nenhum recurso nasce aqui — espelha `TRIP_CONFIRM_LOAD_PATH`. */
    async handle({ context, input }): Promise<Response> {
      const target = await resolveOfficeTarget({
        companyId: context.scope.companyId,
        driverId: input.driverId,
        targets: dependencies.targets,
        tripId: input.tripId,
      })
      const result = await dependencies.startFieldTrip({
        ...buildOfficeContextInput({
          action: isConfirmLoad
            ? OFFICE_TRIP_AUDIT_ACTION.confirmLoad
            : OFFICE_TRIP_AUDIT_ACTION.startRoute,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          ipAddress: input.ipAddress,
        }),
        step,
        target,
      })

      return officeJsonResponse({
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
        ipAddress: dependencies.resolveClientIp(request),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }
    },
    pathname: isConfirmLoad ? OFFICE_CONFIRM_LOAD_PATH : OFFICE_START_ROUTE_PATH,
    policy: OFFICE_REPORT_POLICY,
    rateLimit: OFFICE_TRIP_RATE_LIMIT,
  })
}

function createArrivalRoute(
  dependencies: TripFieldOfficeTripDependencies,
): ReturnType<typeof defineRoute> {
  return defineRoute<
    OfficeRequestInput & {
      readonly arrivedAt: Date
      readonly idempotencyKey: string
      readonly stopId: string
    }
  >({
    async handle({ context, input }): Promise<Response> {
      const target = await resolveOfficeTarget({
        companyId: context.scope.companyId,
        driverId: input.driverId,
        targets: dependencies.targets,
        tripId: input.tripId,
      })
      const result = await dependencies.reportArrival({
        ...buildOfficeContextInput({
          action: OFFICE_TRIP_AUDIT_ACTION.arrive,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          ipAddress: input.ipAddress,
        }),
        arrivedAt: input.arrivedAt,
        idempotencyKey: input.idempotencyKey,
        stopId: input.stopId,
        target,
      })

      return officeJsonResponse({ body: { data: { id: result.id } }, status: 201 })
    },
    method: 'POST',
    async parse({ correlationId, pathParameters, request }) {
      const body = await parseOfficeArrivalRequest(request)
      return {
        arrivedAt: body.arrivedAt ?? new Date(),
        correlationId,
        driverId: body.driverId,
        idempotencyKey: parseIdempotencyKey(request),
        ipAddress: dependencies.resolveClientIp(request),
        stopId: parseUuidPathIdentifier(pathParameters.stopId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }
    },
    pathname: OFFICE_STOP_ARRIVE_PATH,
    policy: OFFICE_REPORT_POLICY,
    rateLimit: OFFICE_TRIP_RATE_LIMIT,
  })
}

function createStopOccurrenceRoute(
  dependencies: TripFieldOfficeTripDependencies,
): ReturnType<typeof defineRoute> {
  return defineRoute<
    OfficeRequestInput & {
      readonly description: string
      readonly distanceMeters: number | null
      readonly documentId: string | null
      readonly idempotencyKey: string
      readonly kind: TripStopOccurrenceKind
      readonly stopId: string
    }
  >({
    async handle({ context, input }): Promise<Response> {
      const target = await resolveOfficeTarget({
        companyId: context.scope.companyId,
        driverId: input.driverId,
        targets: dependencies.targets,
        tripId: input.tripId,
      })
      const result = await dependencies.reportOccurrence({
        ...buildOfficeContextInput({
          action: OFFICE_TRIP_AUDIT_ACTION.occurrence,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          ipAddress: input.ipAddress,
        }),
        description: input.description,
        distanceMeters: input.distanceMeters,
        documentId: input.documentId,
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
        stopId: input.stopId,
        target,
      })

      return officeJsonResponse({ body: { data: { id: result.id } }, status: 201 })
    },
    method: 'POST',
    async parse({ correlationId, pathParameters, request }) {
      const body = await parseOfficeStopOccurrenceRequest(request)
      return {
        ...body,
        correlationId,
        idempotencyKey: parseIdempotencyKey(request),
        ipAddress: dependencies.resolveClientIp(request),
        stopId: parseUuidPathIdentifier(pathParameters.stopId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }
    },
    pathname: OFFICE_STOP_OCCURRENCES_PATH,
    policy: OFFICE_REPORT_POLICY,
    rateLimit: OFFICE_TRIP_RATE_LIMIT,
  })
}

export function createTripFieldOfficeTripRoutes(
  dependencies: TripFieldOfficeTripDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    createFieldStepRoute({ dependencies, step: FIELD_TRIP_STEP.confirmLoad }),
    createFieldStepRoute({ dependencies, step: FIELD_TRIP_STEP.startRoute }),
    createArrivalRoute(dependencies),
    createStopOccurrenceRoute(dependencies),
  ]
}
