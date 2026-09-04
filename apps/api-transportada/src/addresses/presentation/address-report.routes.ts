/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_ADDRESS_REPORT_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { ReadAddressReportUseCase } from '../application/read-address-report.use-case.js'

/**
 * O relatório de endereços a corrigir (spec 084, G8).
 *
 * ⚠️ **`settings.manage`, e não `addresses.read`.** Quem lê isto vê o cadastro de entrega de todos
 * os contratantes de uma vez, com nome, rua e número — é uma varredura da carteira, não a consulta
 * pontual de um CEP que `addresses.read` autoriza (ADR-0040 §2 recusa até projetar `number` na
 * sugestão de CEP pelo mesmo motivo).
 */
const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly readReport: ReadAddressReportUseCase
}

export function createAddressReportRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute({
      async handle({ context }): Promise<Response> {
        const report = await dependencies.readReport.read({
          companyId: context.scope.companyId,
        })

        return new Response(JSON.stringify({ data: report }), {
          headers: NO_STORE_HEADERS,
          status: 200,
        })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: API_ADDRESS_REPORT_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
