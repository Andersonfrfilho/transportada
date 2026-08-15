/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Preço do combustível por produto. O segmento do caminho é o slug do catálogo, não um UUID: sem
 * `pathParameterFormat: 'raw'` o roteador nem casa a rota, e o preflight responde 403 antes de a
 * chamada existir.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_FUEL_PRICES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { FuelProduct } from '../../shared/fuel.constant.js'
import type { EffectiveFuelPrice } from '../domain/fuel-price.policy.js'
import { parseAdjustFuelPriceBody, parseFuelProduct } from './fuel-price.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const PRODUCT_PATH = `${API_COMPANY_SETTINGS_FUEL_PRICES_PATH}/:product`
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type AdjustInput = {
  readonly pricePerUnit: string
  readonly product: FuelProduct
}

type ClearInput = {
  readonly product: FuelProduct
}

type Dependencies = {
  readonly adjust: {
    execute(input: {
      readonly companyId: string
      readonly pricePerUnit: string
      readonly product: FuelProduct
    }): Promise<EffectiveFuelPrice>
  }
  readonly clear: {
    execute(input: { readonly companyId: string; readonly product: FuelProduct }): Promise<void>
  }
  readonly list: {
    execute(input: { readonly companyId: string }): Promise<readonly EffectiveFuelPrice[]>
  }
}

export function createFuelPriceRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const prices = await dependencies.list.execute({ companyId: context.scope.companyId })
        return jsonResponse({ data: prices.map(serializeFuelPrice) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_FUEL_PRICES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<AdjustInput>({
      async handle({ context, input }): Promise<Response> {
        const price = await dependencies.adjust.execute({
          companyId: context.scope.companyId,
          pricePerUnit: input.pricePerUnit,
          product: input.product,
        })
        return jsonResponse({ data: serializeFuelPrice(price) })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        const product = parseFuelProduct(pathParameters.product ?? '')
        const { pricePerUnit } = await parseAdjustFuelPriceBody(request)
        return { pricePerUnit, product }
      },
      pathParameterFormat: 'raw',
      pathname: PRODUCT_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ClearInput>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.clear.execute({
          companyId: context.scope.companyId,
          product: input.product,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({ product: parseFuelProduct(pathParameters.product ?? '') }),
      pathParameterFormat: 'raw',
      pathname: PRODUCT_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function serializeFuelPrice(price: EffectiveFuelPrice): Record<string, unknown> {
  return {
    effectivePricePerUnit: price.effectivePricePerUnit,
    product: price.product,
    reference: price.reference,
    source: price.source,
    unit: price.unit,
    updatedAt: price.updatedAt?.toISOString() ?? null,
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status: 200 })
}
