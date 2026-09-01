/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import {
  API_PUBLIC_EXTRA_CHARGE_BATCHES_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ExtraChargeBatchReport,
  ExtraChargeDecision,
} from '../application/extra-charge-batch.port.js'
import { extraChargeDecisionsSchema } from './extra-charge-batch.routes.js'

const PUBLIC_DECISIONS_PATH = `${API_PUBLIC_EXTRA_CHARGE_BATCHES_PATH}/decisions`

export type PublicExtraChargeBatchDependencies = {
  readonly decideByToken: {
    execute(input: {
      readonly accessToken: string
      readonly decisions: readonly ExtraChargeDecision[]
    }): Promise<ExtraChargeBatchReport>
  }
  readonly readReportByToken: {
    execute(input: { readonly accessToken: string }): Promise<ExtraChargeBatchReport>
  }
}

/**
 * ADR-0048 §7: **a página que o contratante abre.** Ele não ganha conta, papel nem tela do produto —
 * ganha um link, e o token é a credencial.
 *
 * Três coisas que o desenho respeita, e que não são opcionais numa superfície anônima:
 *
 * 1. **um lote, e nada além.** Sem lista, sem busca por documento, sem nome de outro contratante.
 *    Token vazado alcança um período de um contratante;
 * 2. **quem decidiu é quem tinha o link.** A trilha guarda o token, nunca um `userId` inventado;
 * 3. **token desconhecido responde `404`**, igual a lote inexistente — a resposta não confirma que
 *    um token quase certo existe.
 */
export function createPublicExtraChargeBatchRoutes(
  dependencies: PublicExtraChargeBatchDependencies,
): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<{ readonly accessToken: string }>({
      async handle({ input }): Promise<Response> {
        const report = await dependencies.readReportByToken.execute({
          accessToken: input.accessToken,
        })

        return jsonResponse({ body: { data: serializeReport(report) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ accessToken: pathParameters.token ?? '' }),
      pathname: API_PUBLIC_EXTRA_CHARGE_BATCHES_PATH,
      /** O token é opaco por construção, não UUID canônico. */
      pathParameterFormat: 'opaque',
    }),
    defineAnonymousRoute<{
      readonly accessToken: string
      readonly decisions: readonly ExtraChargeDecision[]
    }>({
      async handle({ input }): Promise<Response> {
        const report = await dependencies.decideByToken.execute({
          accessToken: input.accessToken,
          decisions: input.decisions,
        })

        return jsonResponse({ body: { data: serializeReport(report) }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          accessToken: pathParameters.token ?? '',
          decisions: (await parseBody(extraChargeDecisionsSchema, request)).decisions,
        }
      },
      pathname: PUBLIC_DECISIONS_PATH,
      pathParameterFormat: 'opaque',
    }),
  ]
}

/**
 * O que a página mostra é o **relatório daquele lote**: quem cobrou, quando, de que tipo e quanto.
 * O que ela nunca mostra é identificador interno de viagem, de nota ou de cliente — o contratante
 * confere cobrança, não navega na nossa base.
 */
function serializeReport(report: ExtraChargeBatchReport) {
  return {
    batch: {
      closedAt: report.batch.closedAt,
      id: report.batch.id,
      periodEnd: report.batch.periodEnd,
      periodStart: report.batch.periodStart,
      status: report.batch.status,
      totalAmount: report.batch.totalAmount,
    },
    contractorName: report.contractorName,
    items: report.items.map((item) => ({
      amount: item.amount,
      chargeType: item.chargeType,
      chargedOn: item.chargedOn,
      clientName: item.clientName,
      id: item.id,
      notes: item.notes,
      rejectionReason: item.rejectionReason,
      status: item.status,
    })),
    itemsTotal: report.itemsTotal,
  }
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
