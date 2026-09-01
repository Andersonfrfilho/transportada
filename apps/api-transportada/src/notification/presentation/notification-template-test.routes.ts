/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { SendTemplateTestUseCase } from '../application/send-template-test.use-case.js'

/**
 * Fora da árvore que o módulo de notificação publica: provar entrega é operação **do produto**, e o
 * pacote não sabe para quem mandar nem o que fazer com o resultado.
 */
const TEMPLATE_TEST_PATH = '/notification-templates/:key/test'

/**
 * A mesma permissão que edita o template. Quem escreve o texto é quem precisa provar que ele chega —
 * e nada além disso: a rota não aceita destinatário, então ela não concede alcance a mais ninguém.
 */
const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

type Dependencies = {
  readonly sendTemplateTest: SendTemplateTestUseCase
}

export function createNotificationTemplateTestRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly templateKey: string }>({
      async handle({ context, input }) {
        const result = await dependencies.sendTemplateTest.execute({
          context: context.scope,
          templateKey: input.templateKey,
        })
        return new Response(JSON.stringify({ data: result }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 202,
        })
      },
      method: 'POST',
      /**
       * 202 e não 200: o envio entra na fila do módulo e sai pelo worker. Responder 200 diria que a
       * mensagem já chegou, e ela não chegou — chegou o pedido.
       */
      parse: ({ pathParameters }) => ({ templateKey: pathParameters.key ?? '' }),
      pathname: TEMPLATE_TEST_PATH,
      pathParameterFormat: 'raw',
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
