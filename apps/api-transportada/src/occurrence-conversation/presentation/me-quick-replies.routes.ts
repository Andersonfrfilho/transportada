/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T5.1 (D11): as respostas prontas do motorista, configuradas pela empresa (público `driver_reply`).
 * O app lê as ativas na ordem do cadastro, só `{ id, text }`, e as mostra como chips que preenchem o campo —
 * nunca enviam. Sem ficha de motorista, a recusa das rotas `/me`. Sem cadastro, lista vazia (nenhum chip).
 */
import { DRIVER_REPLY_AUDIENCE } from '../../database/occurrence-conversation.schema.js'
import { readListQuery } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { DriverNotRegisteredError } from '../../trips/domain/trip.error.js'
import type { QuickRepliesUseCase } from '../application/quick-replies.use-case.js'
import { jsonResponse } from './me-subject-conversation.routes.js'

const READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
export const ME_QUICK_REPLIES_PATH = '/me/trips/current/quick-replies'
/** Mais chips do que isso não cabem na tela do app; o cadastro continua valendo para o resto. */
export const ME_QUICK_REPLIES_MAX = 50

export function createMeQuickReplyRoutes(dependencies: {
  readonly quickReplies: Pick<QuickRepliesUseCase, 'listForComposer'>
  readonly resolveDriverId: (context: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<null | string>
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const driverId = await dependencies.resolveDriverId(context.scope)
        if (driverId === null) throw new DriverNotRegisteredError()
        const replies = await dependencies.quickReplies.listForComposer({
          audience: DRIVER_REPLY_AUDIENCE,
          companyId: context.scope.companyId,
        })
        return jsonResponse({
          data: replies
            .slice(0, ME_QUICK_REPLIES_MAX)
            .map((reply) => ({ id: reply.id, text: reply.bodyText })),
        })
      },
      method: 'GET',
      parse: ({ request }) => {
        readListQuery(new URL(request.url), new Set())
        return {} as Record<string, never>
      },
      pathname: ME_QUICK_REPLIES_PATH,
      policy: READ_POLICY,
    }),
  ]
}
