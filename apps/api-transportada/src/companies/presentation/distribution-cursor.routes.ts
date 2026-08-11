/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Leitura e ajuste manual do cursor da distribuição de NF-e. A empresa vem sempre do
 * contexto autenticado — o corpo carrega só o NSU.
 */
import type { AdjustDistributionCursorInput } from '../application/adjust-distribution-cursor.use-case.js'
import type { DistributionCursorStatus } from '../application/get-distribution-cursor.use-case.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_DISTRIBUTION_CURSOR_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { parseDistributionCursorAdjustment } from './distribution-cursor.schema.js'
import { serializeDistributionCursor } from './distribution-cursor.serializer.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

type AdjustmentInput = {
  readonly correlationId: string
  readonly ultNsu: string
}

type Dependencies = {
  readonly adjust: {
    execute(input: AdjustDistributionCursorInput): Promise<DistributionCursorStatus>
  }
  readonly getStatus: {
    execute(input: { readonly companyId: string }): Promise<DistributionCursorStatus>
  }
}

export function createDistributionCursorRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return cursorResponse(
          await dependencies.getStatus.execute({ companyId: context.scope.companyId }),
        )
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_DISTRIBUTION_CURSOR_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<AdjustmentInput>({
      async handle({ context, input }): Promise<Response> {
        return cursorResponse(
          await dependencies.adjust.execute({
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            ultNsu: input.ultNsu,
            userId: context.scope.userId,
          }),
        )
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ...(await parseDistributionCursorAdjustment(request)),
      }),
      pathname: API_COMPANY_SETTINGS_DISTRIBUTION_CURSOR_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function cursorResponse(status: DistributionCursorStatus): Response {
  return new Response(JSON.stringify({ data: serializeDistributionCursor(status) }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}
