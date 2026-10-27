/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6 (RF4): a entrega anônima do Evolution e a rota do dono que aponta o webhook para cá.
 */
import {
  defineAnonymousRoute,
  defineRoute,
  type RegisteredAnonymousRoute,
} from '../../http/router.service.js'
import {
  API_PUBLIC_WHATSAPP_EVOLUTION_WEBHOOK_PATH,
  API_WHATSAPP_EVOLUTION_WEBHOOK_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import {
  EVOLUTION_WEBHOOK_TOKEN_HEADER,
  type WhatsAppEvolutionWebhookUseCase,
} from '../application/whatsapp-evolution-webhook.use-case.js'

const OK_STATUS = 200
const UNAUTHORIZED_STATUS = 401
const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

/**
 * Um número conectado gera rajada (confirmações de entrega e leitura de cada envio, mensagens de
 * grupo que ignoramos): o teto é generoso e existe pelo abuso, como o da Meta.
 */
const EVOLUTION_WEBHOOK_RATE_LIMIT = { maxRequests: 600, windowMs: 60_000 } as const

type EvolutionWebhookInput = {
  readonly rawBody: string
  readonly token: null | string
  readonly webhookId: string
}

export function createWhatsAppEvolutionPublicWebhookRoutes(dependencies: {
  readonly webhook: Pick<WhatsAppEvolutionWebhookUseCase, 'receive'>
}): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<EvolutionWebhookInput>({
      async handle({ correlationId, input }): Promise<Response> {
        const receipt = await dependencies.webhook.receive({ correlationId, ...input })
        // 401 sem corpo para qualquer recusa: id inexistente e segredo errado são indistinguíveis.
        if (receipt.outcome === 'unauthorized') {
          return new Response(null, { status: UNAUTHORIZED_STATUS })
        }
        // Aceita ou ignorada é 200: o que não lemos não é erro do Evolution, e erro o faria repetir.
        return new Response(null, { status: OK_STATUS })
      },
      method: 'POST',
      /** O corpo cru: só vira dado depois de o segredo conferir, dentro do caso de uso. */
      async parse({ pathParameters, request }): Promise<EvolutionWebhookInput> {
        return {
          rawBody: await request.text(),
          token: request.headers.get(EVOLUTION_WEBHOOK_TOKEN_HEADER),
          webhookId: pathParameters.webhookId ?? '',
        }
      },
      pathname: API_PUBLIC_WHATSAPP_EVOLUTION_WEBHOOK_PATH,
      // O webhookId é opaco (uuid comparado por igualdade), não decodificado.
      pathParameterFormat: 'opaque',
      rateLimit: EVOLUTION_WEBHOOK_RATE_LIMIT,
    }),
  ]
}

export function createWhatsAppEvolutionWebhookRoutes(dependencies: {
  readonly webhook: Pick<WhatsAppEvolutionWebhookUseCase, 'register'>
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly correlationId: string }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.webhook.register({
          context: context.scope,
          correlationId: input.correlationId,
        })
        return new Response(JSON.stringify({ data: result }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: OK_STATUS,
        })
      },
      method: 'POST',
      parse: ({ correlationId }) => ({ correlationId }),
      pathname: API_WHATSAPP_EVOLUTION_WEBHOOK_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
