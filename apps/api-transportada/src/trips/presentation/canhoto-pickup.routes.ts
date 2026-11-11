/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T3 (D7, RF4): o escritório lista as coletas de canhoto e as encaixa na viagem de outro motorista.
 *
 * - `GET /trip-canhoto-pickups?status=pending&status=scheduled&tripId=&limit=` — as coletas da empresa;
 * - `POST /trip-canhoto-pickups/:id/schedule` `{ tripId }` — encaixa (ou move) a coleta numa viagem não finalizada;
 * - `POST /trip-canhoto-pickups/:id/unschedule` — devolve a coleta a `pending`.
 *
 * `trip.report-on-behalf` nas três: encaixar mexe na viagem que pode já estar na rua (como acrescentar nota depois do
 * despacho, spec 257), e é trabalho do escritório — o separador (`trip.manage`) não alcança. A empresa vem do contexto.
 */
import { z } from 'zod'

import {
  invalidRequest,
  parseAgainstSchema,
  parseBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import {
  CANHOTO_PICKUP_STATUSES,
  type CanhotoPickupStatus,
} from '../../shared/canhoto-pickup.constant.js'
import type { CanhotoPickupScheduleUseCase } from '../application/canhoto-pickup-schedule.use-case.js'

export const CANHOTO_PICKUPS_PATH = '/trip-canhoto-pickups'
export const CANHOTO_PICKUP_SCHEDULE_PATH = '/trip-canhoto-pickups/:pickupId/schedule'
export const CANHOTO_PICKUP_UNSCHEDULE_PATH = '/trip-canhoto-pickups/:pickupId/unschedule'

const CANHOTO_PICKUP_POLICY = { permission: 'trip.report-on-behalf', scope: 'company' } as const

export const CANHOTO_PICKUP_LIST_DEFAULT_LIMIT = 100
export const CANHOTO_PICKUP_LIST_MAX_LIMIT = 200

const scheduleBodySchema = z.object({ tripId: z.uuid() }).strict()

const listQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(CANHOTO_PICKUP_LIST_MAX_LIMIT)
      .default(CANHOTO_PICKUP_LIST_DEFAULT_LIMIT),
    status: z.array(z.enum(CANHOTO_PICKUP_STATUSES)).default([]),
    tripId: z.uuid().optional(),
  })
  .strict()

type ListInput = {
  readonly limit: number
  readonly statuses: readonly CanhotoPickupStatus[]
  readonly tripId?: string
}

type WriteInput = {
  readonly correlationId: string
  readonly pickupId: string
  readonly tripId?: string
}

export type CanhotoPickupRoutesDependencies = {
  readonly canhotoPickups: CanhotoPickupScheduleUseCase
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

function parseListQuery(request: Request): ListInput {
  const parameters = new URL(request.url).searchParams
  const known = new Set(['limit', 'status', 'tripId'])
  const unknown = [...parameters.keys()].filter((key) => !known.has(key))
  if (unknown.length > 0) {
    throw invalidRequest(unknown.map((field) => ({ field, message: 'Unknown parameter' })))
  }
  const query = parseAgainstSchema(listQuerySchema, {
    ...(parameters.get('limit') === null ? {} : { limit: parameters.get('limit') }),
    status: parameters.getAll('status'),
    ...(parameters.get('tripId') === null ? {} : { tripId: parameters.get('tripId') }),
  })
  return {
    limit: query.limit,
    statuses: [...new Set(query.status)],
    ...(query.tripId === undefined ? {} : { tripId: query.tripId }),
  }
}

export function createCanhotoPickupRoutes(
  dependencies: CanhotoPickupRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<ListInput>({
      async handle({ context, input }): Promise<Response> {
        const pickups = await dependencies.canhotoPickups.list({
          companyId: context.scope.companyId,
          ...input,
        })
        return json({ data: pickups })
      },
      method: 'GET',
      parse: ({ request }) => parseListQuery(request),
      pathname: CANHOTO_PICKUPS_PATH,
      policy: CANHOTO_PICKUP_POLICY,
    }),
    defineRoute<WriteInput & { readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const pickup = await dependencies.canhotoPickups.schedule({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          ...input,
        })
        return json({ data: pickup })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const pickupId = parseUuidPathIdentifier(pathParameters.pickupId ?? '')
        const body = await parseBody(scheduleBodySchema, request)
        return { correlationId, pickupId, tripId: body.tripId }
      },
      pathname: CANHOTO_PICKUP_SCHEDULE_PATH,
      policy: CANHOTO_PICKUP_POLICY,
    }),
    defineRoute<WriteInput>({
      async handle({ context, input }): Promise<Response> {
        const pickup = await dependencies.canhotoPickups.unschedule({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          pickupId: input.pickupId,
        })
        return json({ data: pickup })
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        pickupId: parseUuidPathIdentifier(pathParameters.pickupId ?? ''),
      }),
      pathname: CANHOTO_PICKUP_UNSCHEDULE_PATH,
      policy: CANHOTO_PICKUP_POLICY,
    }),
  ]
}
