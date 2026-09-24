/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20 (RF29). `GET /extra-charge-batches/:id/statement` — o demonstrativo de ressarcimento
 * já gerado e guardado, servido como `application/pdf`. Permissão `trip.financials`: dinheiro tem
 * permissão própria (spec 061 D4), e este documento leva valor e evidência.
 *
 * ⚠️ **Esta rota não é pendurada sob `/client/me`** e não abre por token público. A página pública
 * do lote (`public-extra-charge-batch.routes.ts`) serve a decisão do contratante, não a evidência
 * fotográfica; e o portal do contratante é app separada por segurança (ADR-0050). Servir a foto da
 * ocorrência por outra autenticação seria decidir isso sem ninguém decidir — contrato negativo em
 * `test/delivery-clients/occurrence-statement.contract.ts`.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_EXTRA_CHARGE_BATCHES_PATH } from '../../shared/api.constant.js'
import type { OccurrenceStatementDocument } from '../application/occurrence-statement.port.js'

const BATCH_STATEMENT_PATH = `${API_EXTRA_CHARGE_BATCHES_PATH}/:id/statement`
const STATEMENT_READ_POLICY = { permission: 'trip.financials', scope: 'company' } as const

export type OccurrenceStatementRoutesDependencies = {
  readonly readStatement: {
    execute(input: {
      readonly batchId: string
      readonly context: CompanyContext
    }): Promise<OccurrenceStatementDocument>
  }
}

export function createOccurrenceStatementRoutes(
  dependencies: OccurrenceStatementRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly batchId: string }>({
      async handle({ context, input }): Promise<Response> {
        const document = await dependencies.readStatement.execute({
          batchId: input.batchId,
          context: context.scope,
        })

        return new Response(document.bytes, {
          headers: {
            'cache-control': 'no-store',
            'content-disposition': `attachment; filename="${document.fileName}"`,
            'content-type': document.contentType,
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: BATCH_STATEMENT_PATH,
      policy: STATEMENT_READ_POLICY,
    }),
  ]
}
