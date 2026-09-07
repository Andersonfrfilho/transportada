/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Correção manual da tarifa de pedágio, por praça (spec 095). O segmento do caminho é o id do nó do
 * OSM — numérico, não UUID —, e por isso `pathParameterFormat: 'raw'`, no molde de
 * `fuel-price.routes.ts`.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_TOLL_BOOTH_CHARGES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { EffectiveTollBoothCharge } from '../domain/toll-booth-charge.policy.js'
import { parseAdjustTollBoothChargeBody, parseOsmNodeId } from './toll-booth-charge.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NODE_PATH = `${API_COMPANY_SETTINGS_TOLL_BOOTH_CHARGES_PATH}/:osmNodeId`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type AdjustInput = {
  readonly chargeCar: null | string
  readonly chargePerAxle: null | string
  readonly observedOn: string
  readonly osmNodeId: number
}

type ClearInput = {
  readonly osmNodeId: number
}

type Dependencies = {
  readonly adjust: {
    execute(
      input: AdjustInput & { readonly actorUserId: string; readonly companyId: string },
    ): Promise<EffectiveTollBoothCharge>
  }
  readonly clear: {
    execute(input: { readonly companyId: string; readonly osmNodeId: number }): Promise<void>
  }
  readonly list: {
    execute(input: { readonly companyId: string }): Promise<readonly EffectiveTollBoothCharge[]>
  }
}

export function createTollBoothChargeRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const charges = await dependencies.list.execute({ companyId: context.scope.companyId })
        return jsonResponse({ data: charges.map(serializeTollBoothCharge) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_TOLL_BOOTH_CHARGES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<AdjustInput>({
      async handle({ context, input }): Promise<Response> {
        const charge = await dependencies.adjust.execute({
          actorUserId: context.identity.userId,
          chargeCar: input.chargeCar,
          chargePerAxle: input.chargePerAxle,
          companyId: context.scope.companyId,
          observedOn: input.observedOn,
          osmNodeId: input.osmNodeId,
        })
        return jsonResponse({ data: serializeTollBoothCharge(charge) })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        const osmNodeId = parseOsmNodeId(pathParameters.osmNodeId ?? '')
        const body = await parseAdjustTollBoothChargeBody(request)
        return { ...body, osmNodeId }
      },
      pathParameterFormat: 'raw',
      pathname: NODE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ClearInput>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.clear.execute({
          companyId: context.scope.companyId,
          osmNodeId: input.osmNodeId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({
        osmNodeId: parseOsmNodeId(pathParameters.osmNodeId ?? ''),
      }),
      pathParameterFormat: 'raw',
      pathname: NODE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function serializeTollBoothCharge(charge: EffectiveTollBoothCharge): Record<string, unknown> {
  return {
    actorUserId: charge.actorUserId,
    catalog: charge.catalog,
    effectiveChargeCar: charge.effectiveChargeCar,
    effectiveChargePerAxle: charge.effectiveChargePerAxle,
    name: charge.name,
    observedOn: charge.observedOn,
    operator: charge.operator,
    osmNodeId: charge.osmNodeId,
    source: charge.source,
    updatedAt: charge.updatedAt?.toISOString() ?? null,
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status: 200 })
}
