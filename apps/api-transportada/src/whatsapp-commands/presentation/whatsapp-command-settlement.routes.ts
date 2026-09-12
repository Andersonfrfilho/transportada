/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier } from '../../identity/presentation/user-administration.schema.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  SettleWhatsAppCommand,
  SettleWhatsAppCommandOutcome,
} from '../application/settle-whatsapp-command.use-case.js'

const SETTLEMENT_PATH = '/whatsapp-command-requests/:id/settlement'
/**
 * Spec 144 T014, molde do `mdfe-auto-issue` (ADR-0047 §4): só o papel `automation` tem a permissão,
 * e a empresa chega pelo `x-company-id` validado contra a membership do serviço.
 */
const WHATSAPP_SETTLE_POLICY = { permission: 'whatsapp.settle', scope: 'company' } as const

type Dependencies = {
  readonly settle: SettleWhatsAppCommand
}

/**
 * Quem chama é o worker, e por isso a rota **relata em vez de recusar**: aguardar, já liquidado e
 * não achado são 200 com o desfecho. Recusa virava nova tentativa a cada batida, sem nada mudar.
 */
export function createWhatsAppCommandSettlementRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly correlationId: string; readonly requestId: string }>({
      async handle({ context, input }): Promise<Response> {
        const outcome = await dependencies.settle({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          requestId: input.requestId,
        })
        return new Response(JSON.stringify({ data: toResponseBody(outcome) }), {
          headers: { 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        requestId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: SETTLEMENT_PATH,
      policy: WHATSAPP_SETTLE_POLICY,
    }),
  ]
}

function toResponseBody(outcome: SettleWhatsAppCommandOutcome): Readonly<Record<string, string>> {
  switch (outcome.kind) {
    case 'settled':
      return {
        message: outcome.message,
        outcome: outcome.kind,
        settlementOutcome: outcome.settlementOutcome,
        status: outcome.status,
      }
    case 'resumed':
      return { outcome: outcome.kind, result: outcome.result }
    default:
      return { outcome: outcome.kind }
  }
}
