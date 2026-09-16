/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 D3: o valor geral de diária que a empresa paga quando o motorista não tem valor
 * próprio. `settings.manage` porque mexe no custo de toda viagem — é configuração, não operação.
 * Sem linha é resposta válida: o valor padrão do sistema, não 404.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { DEFAULT_DAILY_ALLOWANCE_AMOUNT } from '../../trips/domain/daily-allowance.constant.js'
import {
  DAILY_ALLOWANCE_RATE_ORIGIN,
  type DailyAllowanceRateOrigin,
} from '../../trips/domain/daily-allowance.policy.js'
import type { DriverAllowanceSettings } from '../application/driver-allowance-settings.port.js'
import { parseDriverAllowanceSettingsBody } from './driver-allowance-settings.schema.js'

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
    execute(input: { readonly companyId: string }): Promise<DriverAllowanceSettings | null>
  }
  readonly set: {
    execute(input: Actor & { readonly amount: string }): Promise<DriverAllowanceSettings>
  }
}

type SetInput = { readonly amount: string; readonly correlationId: string }

export function createDriverAllowanceSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return jsonResponse(await dependencies.get.execute({ companyId: context.scope.companyId }))
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SetInput>({
      async handle({ context, input }): Promise<Response> {
        return jsonResponse(
          await dependencies.set.execute({
            amount: input.amount,
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            userId: context.scope.userId,
          }),
        )
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ...(await parseDriverAllowanceSettingsBody(request)),
      }),
      pathname: API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH,
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
      pathname: API_COMPANY_SETTINGS_DRIVER_ALLOWANCE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

type DriverAllowanceSettingsView = {
  readonly amount: string
  readonly rateOrigin: DailyAllowanceRateOrigin
  readonly updatedAt: string | null
}

/** Sem linha vale o padrão do sistema: "não configurado" é resposta, não 404. */
function jsonResponse(settings: DriverAllowanceSettings | null): Response {
  const data: DriverAllowanceSettingsView =
    settings === null
      ? {
          amount: DEFAULT_DAILY_ALLOWANCE_AMOUNT,
          rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.default,
          updatedAt: null,
        }
      : {
          amount: settings.amount,
          rateOrigin: DAILY_ALLOWANCE_RATE_ORIGIN.company,
          updatedAt: settings.updatedAt.toISOString(),
        }

  return new Response(JSON.stringify({ data }), { headers: NO_STORE_HEADERS, status: 200 })
}
