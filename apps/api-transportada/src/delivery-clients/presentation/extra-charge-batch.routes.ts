/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Fechar período e registrar decisão é dinheiro cobrado de outra empresa: `billing.create` para
 * fechar, `billing.read` para conferir. A decisão do próprio contratante entra pela página pública
 * da landing, que é anônima e escopada a um lote (ADR-0048 §7).
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_EXTRA_CHARGE_BATCHES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  ExtraChargeBatch,
  ExtraChargeBatchReport,
  ExtraChargeDecision,
} from '../application/extra-charge-batch.port.js'

const BATCH_PATH = `${API_EXTRA_CHARGE_BATCHES_PATH}/:id`
const BATCH_REPORT_PATH = `${BATCH_PATH}/report`
const BATCH_DECISIONS_PATH = `${BATCH_PATH}/decisions`

const BATCH_CREATE_POLICY = { permission: 'billing.create', scope: 'company' } as const
const BATCH_READ_POLICY = { permission: 'billing.read', scope: 'company' } as const

const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u

const closeSchema = z
  .object({
    contractorId: z.string().uuid(),
    periodEnd: z.string().regex(DATE_PATTERN),
    periodStart: z.string().regex(DATE_PATTERN),
  })
  .strict()
  .refine((period) => period.periodStart <= period.periodEnd, {
    message: 'The period must start before it ends',
    path: ['periodEnd'],
  })

export const extraChargeDecisionsSchema = z
  .object({
    decisions: z
      .array(
        z
          .object({
            chargeId: z.string().uuid(),
            decision: z.enum(['approved', 'rejected']),
            /** Rejeição sem motivo é perda que ninguém consegue explicar depois. */
            reason: z.string().trim().max(500).default(''),
          })
          .strict()
          .refine((decision) => decision.decision === 'approved' || decision.reason.length > 0, {
            message: 'A rejection requires a reason',
            path: ['reason'],
          }),
      )
      .min(1)
      .max(500),
  })
  .strict()

export type ExtraChargeBatchRoutesDependencies = {
  readonly closeBatch: {
    execute(input: {
      readonly context: CompanyContext
      readonly contractorId: string
      readonly periodEnd: string
      readonly periodStart: string
    }): Promise<ExtraChargeBatch>
  }
  readonly decideBatch: {
    execute(input: {
      readonly batchId: string
      readonly context: CompanyContext
      readonly decisions: readonly ExtraChargeDecision[]
    }): Promise<ExtraChargeBatchReport>
  }
  readonly readReport: {
    execute(input: {
      readonly batchId: string
      readonly context: CompanyContext
    }): Promise<ExtraChargeBatchReport>
  }
}

export function createExtraChargeBatchRoutes(
  dependencies: ExtraChargeBatchRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<z.infer<typeof closeSchema>>({
      async handle({ context, input }): Promise<Response> {
        const batch = await dependencies.closeBatch.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: batch }, status: 201 })
      },
      method: 'POST',
      parse: ({ request }) => parseBody(closeSchema, request),
      pathname: API_EXTRA_CHARGE_BATCHES_PATH,
      policy: BATCH_CREATE_POLICY,
    }),
    defineRoute<{ readonly batchId: string }>({
      async handle({ context, input }): Promise<Response> {
        const report = await dependencies.readReport.execute({
          batchId: input.batchId,
          context: context.scope,
        })

        return jsonResponse({ body: { data: report }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: BATCH_REPORT_PATH,
      policy: BATCH_READ_POLICY,
    }),
    defineRoute<{ readonly batchId: string; readonly decisions: readonly ExtraChargeDecision[] }>({
      async handle({ context, input }): Promise<Response> {
        const report = await dependencies.decideBatch.execute({
          batchId: input.batchId,
          context: context.scope,
          decisions: input.decisions,
        })

        return jsonResponse({ body: { data: report }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          batchId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          decisions: (await parseBody(extraChargeDecisionsSchema, request)).decisions,
        }
      },
      pathname: BATCH_DECISIONS_PATH,
      policy: BATCH_CREATE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
