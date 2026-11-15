/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Orçamento de frete pelo custo da viagem (spec 326). Parâmetros: `settings.manage` grava, e quem
 * simula lê. O cálculo (`POST /freight-quotes`) é consulta e não grava: `freight.simulate`.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_FREIGHT_QUOTE_SETTINGS_PATH,
  API_FREIGHT_QUOTES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  FreightQuoteRequest,
  FreightQuoteResponse,
  FreightQuoteSettingsView,
} from '../application/freight-quote.use-case.js'
import { FreightQuoteFuelPriceMissingError } from '../application/freight-quote.use-case.js'
import {
  ANTT_CARGO_TYPES,
  ANTT_FLOOR_AXLES,
  ANTT_FLOOR_SOURCE,
} from '../domain/antt-floor.constant.js'
import { FREIGHT_QUOTE_DEFAULTS } from '../domain/freight-quote-defaults.constant.js'
import {
  freightQuoteFuelPriceMissing,
  freightQuoteInputInvalid,
} from '../domain/freight-quote.error.js'
import {
  FreightQuoteInputError,
  type FreightQuoteSettingsValues,
} from '../domain/freight-quote.policy.js'
import {
  parseFreightQuoteBody,
  parseFreightQuoteSettingsBody,
  type FreightQuoteBody,
} from './freight-quote.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const FREIGHT_SIMULATE_POLICY = { permission: 'freight.simulate', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Actor = {
  readonly companyId: string
  readonly correlationId: string
  readonly userId: string
}

type Dependencies = {
  readonly calculate: { execute(input: FreightQuoteRequest): Promise<FreightQuoteResponse> }
  readonly clear: { execute(input: Actor): Promise<void> }
  readonly get: {
    execute(input: { readonly companyId: string }): Promise<FreightQuoteSettingsView>
  }
  readonly set: {
    execute(
      input: Actor & { readonly values: FreightQuoteSettingsValues },
    ): Promise<FreightQuoteSettingsView>
  }
}

type SetInput = { readonly correlationId: string; readonly values: FreightQuoteSettingsValues }

export function createFreightQuoteRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return settingsResponse(
          await dependencies.get.execute({ companyId: context.scope.companyId }),
        )
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_FREIGHT_QUOTE_SETTINGS_PATH,
      policy: FREIGHT_SIMULATE_POLICY,
    }),
    defineRoute<SetInput>({
      async handle({ context, input }): Promise<Response> {
        return settingsResponse(
          await dependencies.set.execute({
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            userId: context.scope.userId,
            values: input.values,
          }),
        )
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        values: await parseFreightQuoteSettingsBody(request),
      }),
      pathname: API_FREIGHT_QUOTE_SETTINGS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly correlationId: string }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.clear.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          userId: context.scope.userId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ correlationId }) => ({ correlationId }),
      pathname: API_FREIGHT_QUOTE_SETTINGS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<FreightQuoteBody>({
      async handle({ context, input }): Promise<Response> {
        try {
          const data = await dependencies.calculate.execute({
            ...input,
            companyId: context.scope.companyId,
          })
          return new Response(JSON.stringify({ data }), { headers: NO_STORE_HEADERS, status: 200 })
        } catch (error) {
          if (error instanceof FreightQuoteFuelPriceMissingError)
            throw freightQuoteFuelPriceMissing()
          if (error instanceof FreightQuoteInputError) throw freightQuoteInputInvalid(error.code)
          throw error
        }
      },
      method: 'POST',
      parse: ({ request }) => parseFreightQuoteBody(request),
      pathname: API_FREIGHT_QUOTES_PATH,
      policy: FREIGHT_SIMULATE_POLICY,
    }),
  ]
}

/** Resposta carrega o padrão do sistema e a fonte do piso, para a tela explicar de onde vem cada número. */
function settingsResponse(view: FreightQuoteSettingsView): Response {
  const data = {
    anttFloor: {
      axles: ANTT_FLOOR_AXLES,
      cargoTypes: ANTT_CARGO_TYPES,
      source: ANTT_FLOOR_SOURCE,
    },
    defaults: FREIGHT_QUOTE_DEFAULTS,
    origin: view.origin,
    updatedAt: view.updatedAt === null ? null : view.updatedAt.toISOString(),
    values: view.values,
  }
  return new Response(JSON.stringify({ data }), { headers: NO_STORE_HEADERS, status: 200 })
}
