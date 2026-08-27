/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0050 §5: o rastreamento ao vivo tem três guardas, e duas delas moram aqui — o consentimento é
 * do motorista e ele o retira quando quiser; a posição só é aceita enquanto a viagem está na rua.
 * A terceira (o cliente vê a carga, nunca quem dirige) mora na leitura do portal.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import {
  API_ME_CURRENT_TRIP_PATH,
  API_ME_LOCATION_CONSENT_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { DriverNotRegisteredError } from '../domain/trip.error.js'
import type { RecordTripLocationResult } from '../application/record-trip-location.use-case.js'

const LOCATION_PATH = `${API_ME_CURRENT_TRIP_PATH}/location`

const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const

/**
 * Sete casas decimais é a precisão da coluna, e ela chega como **texto**: `number` traria erro
 * binário para dentro de coordenada, que é o mesmo motivo de dinheiro nunca ser float aqui.
 */
const COORDINATE_PATTERN = /^-?[0-9]{1,3}(\.[0-9]{1,7})?$/u

const consentSchema = z.object({ accepted: z.boolean() }).strict()
const locationSchema = z
  .object({
    latitude: z.string().regex(COORDINATE_PATTERN),
    longitude: z.string().regex(COORDINATE_PATTERN),
  })
  .strict()

export type MeLocationDependencies = {
  readonly recordLocation: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly latitude: string
    readonly longitude: string
  }) => Promise<RecordTripLocationResult>
  /** `null` quando a conta autenticada não está ligada a nenhum cadastro de motorista. */
  readonly resolveDriverId: (input: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<string | null>
  readonly setConsent: (input: {
    readonly accepted: boolean
    readonly companyId: string
    readonly driverId: string
  }) => Promise<{ readonly acceptedAt: string | null }>
}

export function createMeLocationRoutes(
  dependencies: MeLocationDependencies,
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
    defineRoute<{ readonly accepted: boolean }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const consent = await dependencies.setConsent({
          accepted: input.accepted,
          companyId: context.scope.companyId,
          driverId,
        })

        return jsonResponse({ body: { data: consent }, status: 200 })
      },
      method: 'PUT',
      parse: async ({ request }) => parseBody(consentSchema, request),
      pathname: API_ME_LOCATION_CONSENT_PATH,
      policy: REPORT_POLICY,
    }),
    defineRoute<{ readonly latitude: string; readonly longitude: string }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const result = await dependencies.recordLocation({
          companyId: context.scope.companyId,
          driverId,
          latitude: input.latitude,
          longitude: input.longitude,
        })

        /**
         * `202` para o ignorado e `201` para o gravado: o app não muda de comportamento por causa da
         * diferença, mas quem lê o log de produção precisa distinguir "chegou e não valia" de
         * "chegou e virou linha" sem abrir o banco.
         */
        return jsonResponse({
          body: { data: { outcome: result.outcome } },
          status: result.outcome === 'recorded' ? 201 : 202,
        })
      },
      method: 'POST',
      parse: async ({ request }) => parseBody(locationSchema, request),
      pathname: LOCATION_PATH,
      policy: REPORT_POLICY,
    }),
  ]
}

function jsonResponse(input: {
  readonly body: Record<string, unknown>
  readonly status: number
}): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
