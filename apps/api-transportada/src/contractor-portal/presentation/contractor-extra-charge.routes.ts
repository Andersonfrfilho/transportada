/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0050 §6: o contratante decide o repasse **linha a linha**, pelo mesmo ciclo da 060. A rota de
 * decisão recebe id de lançamento porque é isso que ele está decidindo — e todo id que chega é
 * conferido contra o lote, que por sua vez é conferido contra o vínculo da conta.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_CLIENT_EXTRA_CHARGE_BATCHES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ExtraChargeBatchReport,
  ExtraChargeDecision,
} from '../../delivery-clients/application/extra-charge-batch.port.js'
import { extraChargeDecisionsSchema } from '../../delivery-clients/presentation/extra-charge-batch.routes.js'

const BATCH_DECISIONS_PATH = `${API_CLIENT_EXTRA_CHARGE_BATCHES_PATH}/:id/decisions`

const DECIDE_POLICY = { permission: 'charges.decide', scope: 'company' } as const
const TRACK_POLICY = { permission: 'deliveries.track', scope: 'company' } as const

export type ContractorExtraChargeRoutesDependencies = {
  readonly decideBatch: {
    execute(input: {
      readonly batchId: string
      readonly context: CompanyContext
      readonly decisions: readonly ExtraChargeDecision[]
    }): Promise<ExtraChargeBatchReport>
  }
  readonly listBatches: {
    execute(input: { readonly context: CompanyContext }): Promise<readonly ExtraChargeBatchReport[]>
  }
}

export function createContractorExtraChargeRoutes(
  dependencies: ContractorExtraChargeRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const reports = await dependencies.listBatches.execute({ context: context.scope })

        return jsonResponse({ body: { data: reports.map(serializeReport) }, status: 200 })
      },
      method: 'GET',
      parse: () => ({}) as Record<string, never>,
      pathname: API_CLIENT_EXTRA_CHARGE_BATCHES_PATH,
      policy: TRACK_POLICY,
    }),
    defineRoute<{ readonly batchId: string; readonly decisions: readonly ExtraChargeDecision[] }>({
      async handle({ context, input }): Promise<Response> {
        const report = await dependencies.decideBatch.execute({
          batchId: input.batchId,
          context: context.scope,
          decisions: input.decisions,
        })

        return jsonResponse({ body: { data: serializeReport(report) }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          decisions: (await parseBody(extraChargeDecisionsSchema, request)).decisions,
        }
      },
      pathname: BATCH_DECISIONS_PATH,
      /**
       * Aprovar cobrança é decisão de dinheiro, e ela tem permissão própria: quem acompanha entrega
       * não decide repasse por consequência de conseguir ver a entrega.
       */
      policy: DECIDE_POLICY,
    }),
  ]
}

/**
 * O mesmo recorte da página pública por token (060 T012): nada de `clientTaxId`, de id de viagem nem
 * de id de nota. O contratante confere cobrança, não navega na nossa base.
 */
function serializeReport(report: ExtraChargeBatchReport): Record<string, unknown> {
  return {
    batch: {
      closedAt: report.batch.closedAt,
      id: report.batch.id,
      periodEnd: report.batch.periodEnd,
      periodStart: report.batch.periodStart,
      status: report.batch.status,
      totalAmount: report.batch.totalAmount,
    },
    items: report.items.map((item) => ({
      amount: item.amount,
      chargedOn: item.chargedOn,
      chargeType: item.chargeType,
      clientName: item.clientName,
      id: item.id,
      notes: item.notes,
      rejectionReason: item.rejectionReason,
      status: item.status,
    })),
    itemsTotal: report.itemsTotal,
  }
}

function jsonResponse(input: {
  readonly body: Record<string, unknown>
  readonly status: number
}): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
