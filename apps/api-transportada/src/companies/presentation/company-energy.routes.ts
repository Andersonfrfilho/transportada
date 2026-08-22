/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A distribuidora que atende a garagem, e o fator que leva a tarifa seca ao que a conta cobra. A
 * leitura devolve a escolha **e** a lista: o painel desenha um campo só, e uma segunda rota para o
 * catálogo custaria uma ida a mais.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_COMPANY_SETTINGS_ENERGY_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CompanyEnergySettings } from '../domain/company-energy.policy.js'
import { parseChooseDistributorBody } from './company-energy.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type ChooseInput = {
  readonly adjustmentFactor: string
  readonly distributorCode: string
}

type Dependencies = {
  readonly choose: {
    execute(input: {
      readonly adjustmentFactor: string
      readonly companyId: string
      readonly distributorCode: string
    }): Promise<CompanyEnergySettings>
  }
  readonly clear: {
    execute(input: { readonly companyId: string }): Promise<void>
  }
  readonly getSettings: {
    execute(input: { readonly companyId: string }): Promise<CompanyEnergySettings>
  }
}

export function createCompanyEnergyRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.getSettings.execute({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: serializeSettings(settings) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_ENERGY_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ChooseInput>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.choose.execute({
          adjustmentFactor: input.adjustmentFactor,
          companyId: context.scope.companyId,
          distributorCode: input.distributorCode,
        })
        return jsonResponse({ data: serializeSettings(settings) })
      },
      method: 'PUT',
      parse: ({ request }) => parseChooseDistributorBody(request),
      pathname: API_COMPANY_SETTINGS_ENERGY_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        await dependencies.clear.execute({ companyId: context.scope.companyId })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_ENERGY_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function serializeSettings(settings: CompanyEnergySettings): Record<string, unknown> {
  return {
    adjustmentFactor: settings.adjustmentFactor,
    distributorCode: settings.distributorCode,
    distributors: settings.distributors.map((distributor) => ({
      code: distributor.code,
      taxId: distributor.taxId,
    })),
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status: 200 })
}
