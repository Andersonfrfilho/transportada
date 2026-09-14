/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 126: o regime federal da empresa. `settings.manage` porque mexe na margem de toda viagem — é
 * configuração, não operação. A empresa vem sempre do contexto autenticado.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_FEDERAL_TAXES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  FederalTaxRates,
  FederalTaxSettings,
} from '../application/federal-tax-settings.port.js'
import { parseFederalTaxSettingsBody } from './federal-tax-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Actor = {
  readonly companyId: string
  readonly correlationId: string
  readonly userId: string
}

type Dependencies = {
  readonly clear: { execute(input: Actor): Promise<void> }
  readonly get: {
    execute(input: { readonly companyId: string }): Promise<FederalTaxSettings | null>
  }
  readonly set: { execute(input: Actor & FederalTaxRates): Promise<FederalTaxSettings> }
}

type SetInput = FederalTaxRates & { readonly correlationId: string }

export function createFederalTaxSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return jsonResponse(await dependencies.get.execute({ companyId: context.scope.companyId }))
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_FEDERAL_TAXES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SetInput>({
      async handle({ context, input }): Promise<Response> {
        return jsonResponse(
          await dependencies.set.execute({
            cofinsRate: input.cofinsRate,
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            federalRegime: input.federalRegime,
            pisRate: input.pisRate,
            userId: context.scope.userId,
          }),
        )
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ...(await parseFederalTaxSettingsBody(request)),
      }),
      pathname: API_COMPANY_SETTINGS_FEDERAL_TAXES_PATH,
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
      pathname: API_COMPANY_SETTINGS_FEDERAL_TAXES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

/** Sem linha é `{ data: null }`: "não declarado" é resposta, não 404. */
function jsonResponse(settings: FederalTaxSettings | null): Response {
  const data =
    settings === null
      ? null
      : {
          cofinsRate: settings.cofinsRate,
          federalRegime: settings.federalRegime,
          pisRate: settings.pisRate,
          updatedAt: settings.updatedAt.toISOString(),
        }

  return new Response(JSON.stringify({ data }), { headers: NO_STORE_HEADERS, status: 200 })
}
