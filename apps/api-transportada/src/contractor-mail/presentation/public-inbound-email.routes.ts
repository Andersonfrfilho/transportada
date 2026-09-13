/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T010 (RF11, ADR-0063 §7): `POST /public/inbound-emails/:webhookId`. Terceira superfície
 * anônima do produto, e a primeira assinada — o corpo cru precisa ser lido **antes** de qualquer
 * parse (é ele que entra no HMAC), então `parse` só coleta o que a assinatura exige e devolve; quem
 * decide 401 ou 204 é o caso de uso, dentro de `handle`.
 */
import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import { API_PUBLIC_INBOUND_EMAILS_PATH } from '../../shared/api.constant.js'
import { ContractorMailInboundWebhookUnauthorizedError } from '../domain/contractor-mail.error.js'
import type { ProcessInboundEmailWebhookUseCase } from '../application/process-inbound-email-webhook.use-case.js'

const NO_CONTENT_STATUS = 204
const ONE_MINUTE_MS = 60_000
/**
 * Revisão do `architect`: a rota não tinha teto nenhum. O Resend costuma mandar um webhook por
 * e-mail recebido, e uma empresa concentra várias respostas de contratantes numa janela curta — o
 * teto é generoso o bastante para não confundir tráfego normal com abuso, e barato de sustentar: a
 * checagem cara (banco + HMAC) já nem roda antes disso, porque a assinatura é conferida em duas
 * etapas (ver `process-inbound-email-webhook.use-case.ts`).
 */
const INBOUND_EMAIL_WEBHOOK_RATE_LIMIT = { maxRequests: 120, windowMs: 5 * ONE_MINUTE_MS } as const

type InboundEmailWebhookInput = {
  readonly rawBody: string
  readonly svixId: string
  readonly svixSignature: string
  readonly svixTimestamp: string
  readonly webhookId: string
}

type Dependencies = {
  readonly processInboundEmailWebhook: ProcessInboundEmailWebhookUseCase
}

export function createPublicInboundEmailRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<InboundEmailWebhookInput>({
      async handle({ correlationId, input }): Promise<Response> {
        const result = await dependencies.processInboundEmailWebhook.execute({
          correlationId,
          rawBody: input.rawBody,
          svixId: input.svixId,
          svixSignature: input.svixSignature,
          svixTimestamp: input.svixTimestamp,
          webhookId: input.webhookId,
        })

        if (result.outcome === 'unauthorized') {
          throw new ContractorMailInboundWebhookUnauthorizedError()
        }
        // 204 invariável para aceito ou ignorado (tipo de evento que não interessa, ou repetido):
        // o Svix retenta qualquer resposta que não seja 2xx.
        return new Response(null, { status: NO_CONTENT_STATUS })
      },
      method: 'POST',
      // O corpo cru precisa chegar intacto ao HMAC — nenhum parse de JSON acontece aqui.
      async parse({ pathParameters, request }): Promise<InboundEmailWebhookInput> {
        const rawBody = await request.text()
        return {
          rawBody,
          svixId: request.headers.get('svix-id') ?? '',
          svixSignature: request.headers.get('svix-signature') ?? '',
          svixTimestamp: request.headers.get('svix-timestamp') ?? '',
          webhookId: pathParameters.webhookId ?? '',
        }
      },
      pathname: API_PUBLIC_INBOUND_EMAILS_PATH,
      // O webhookId é opaco por construção (uuid comparado por igualdade), não decodificado.
      pathParameterFormat: 'opaque',
      rateLimit: INBOUND_EMAIL_WEBHOOK_RATE_LIMIT,
    }),
  ]
}
