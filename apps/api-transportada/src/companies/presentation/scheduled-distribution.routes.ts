/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Leitura e escrita do opt-in da distribuição agendada. A escrita vive só aqui:
 * a aba "Remota" da tela de notas apenas navega para cá.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_COMPANY_SETTINGS_SCHEDULED_DISTRIBUTION_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { DisableScheduledDistributionResult } from '../application/enable-scheduled-distribution.port.js'
import type { EnableScheduledDistributionResult } from '../application/enable-scheduled-distribution.port.js'
import type { ScheduledDistributionStatus } from '../application/get-scheduled-distribution-status.use-case.js'
import { serializeScheduledDistributionStatus } from './scheduled-distribution.serializer.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

type Dependencies = {
  readonly disable: {
    execute(input: { readonly companyId: string }): Promise<DisableScheduledDistributionResult>
  }
  readonly enable: {
    execute(input: { readonly companyId: string }): Promise<EnableScheduledDistributionResult>
  }
  readonly getStatus: {
    execute(input: { readonly companyId: string }): Promise<ScheduledDistributionStatus>
  }
}

export function createScheduledDistributionRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const statusOf = (context: CompanyContext): Promise<ScheduledDistributionStatus> =>
    dependencies.getStatus.execute({ companyId: context.companyId })

  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return statusResponse(await statusOf(context.scope))
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_SCHEDULED_DISTRIBUTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        await dependencies.enable.execute({ companyId: context.scope.companyId })
        return statusResponse(await statusOf(context.scope))
      },
      method: 'PUT',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_SCHEDULED_DISTRIBUTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        await dependencies.disable.execute({ companyId: context.scope.companyId })
        return statusResponse(await statusOf(context.scope))
      },
      method: 'DELETE',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_SCHEDULED_DISTRIBUTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function statusResponse(status: ScheduledDistributionStatus): Response {
  return new Response(JSON.stringify({ data: serializeScheduledDistributionStatus(status) }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}
