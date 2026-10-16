/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o motorista lê as ocorrências da viagem atual dele. O prefixo é
 * `route-occurrences` porque o roteador entrega o primeiro match dinâmico e
 * `/me/trips/current/occurrences/:id/messages` já existe. A empresa e o motorista vêm do contexto
 * autenticado, nunca do caminho; fora da viagem não finalizada, tudo é 404.
 */
import { invalidRequest, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { API_ME_CURRENT_TRIP_PATH } from '../../shared/api.constant.js'
import { DriverNotRegisteredError } from '../domain/trip.error.js'
import type { FindDriverRouteOccurrenceUseCase } from '../application/find-driver-route-occurrence.use-case.js'
import type { SignDriverRouteOccurrenceFileUseCase } from '../application/sign-driver-route-occurrence-file.use-case.js'
import type { ListDriverRouteOccurrencesUseCase } from '../application/list-driver-route-occurrences.use-case.js'
import type { OccurrenceKind } from '../application/occurrence-resolution.port.js'

const ROUTE_OCCURRENCES_PATH = `${API_ME_CURRENT_TRIP_PATH}/route-occurrences`
const ROUTE_OCCURRENCE_PATH = `${ROUTE_OCCURRENCES_PATH}/:kind/:id`
const ROUTE_OCCURRENCE_FILE_URL_PATH = `${ROUTE_OCCURRENCE_PATH}/attachments/:objectId/url`
const DRIVER_READ_POLICY = { permission: 'trip.read', scope: 'company' } as const

export type MeRouteOccurrenceRoutesDependencies = {
  readonly findOccurrence: FindDriverRouteOccurrenceUseCase
  readonly listOccurrences: ListDriverRouteOccurrencesUseCase
  readonly signFile: SignDriverRouteOccurrenceFileUseCase
  readonly resolveDriverId: (context: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<string | null>
}

type RouteOccurrenceTarget = {
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceKind
}

function parseOccurrenceKind(value: string | undefined): OccurrenceKind {
  if (value === 'document' || value === 'stop') return value
  throw invalidRequest([{ field: 'kind', message: 'Must be document or stop' }])
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status: 200,
  })
}

export function createMeRouteOccurrenceRoutes(
  dependencies: MeRouteOccurrenceRoutesDependencies,
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
        const driverId = await resolveDriver(context.scope)
        const data = await dependencies.listOccurrences.execute({
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: ROUTE_OCCURRENCES_PATH,
      policy: DRIVER_READ_POLICY,
    }),
    defineRoute<RouteOccurrenceTarget>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const data = await dependencies.findOccurrence.execute({
          ...input,
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        occurrenceKind: parseOccurrenceKind(pathParameters.kind),
      }),
      pathParameterFormat: 'raw',
      pathname: ROUTE_OCCURRENCE_PATH,
      policy: DRIVER_READ_POLICY,
    }),
    defineRoute<RouteOccurrenceTarget & { readonly objectId: string }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const data = await dependencies.signFile.execute({
          ...input,
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        objectId: parseUuidPathIdentifier(pathParameters.objectId ?? ''),
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        occurrenceKind: parseOccurrenceKind(pathParameters.kind),
      }),
      pathParameterFormat: 'raw',
      pathname: ROUTE_OCCURRENCE_FILE_URL_PATH,
      policy: DRIVER_READ_POLICY,
    }),
  ]
}
