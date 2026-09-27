/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T505 (RF9): a fila das mensagens sem conversa certa. Ler é da listagem (`fleet.read`);
 * atribuir é de quem conduz a tratativa (`occurrences.resolve`). O plano dizia `trip.manage` nas
 * duas, mas o separador tem `trip.manage`, e escolher para qual conversa a mensagem da contratante
 * vai é conduzir a tratativa (mesma correção da T404). Toda resposta é `no-store`: leva telefone e
 * corpo.
 */
import { z } from 'zod'

import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type {
  AssignUnassignedMessageUseCase,
  ListUnassignedMessagesUseCase,
} from '../application/occurrence-conversation-unassigned.use-case.js'

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const WRITE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const assignSchema = z.object({ conversationId: z.string().uuid() }).strict()

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status: 200,
  })
}

export function createOccurrenceConversationUnassignedRoutes(dependencies: {
  readonly assign: AssignUnassignedMessageUseCase
  readonly list: ListUnassignedMessagesUseCase
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const data = await dependencies.list.list({ companyId: context.scope.companyId })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: '/occurrence-conversations/unassigned',
      policy: READ_POLICY,
    }),
    defineRoute<{ readonly conversationId: string; readonly unassignedId: string }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.assign.assign({
          companyId: context.scope.companyId,
          conversationId: input.conversationId,
          unassignedId: input.unassignedId,
          userId: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(assignSchema, request)
        return {
          conversationId: body.conversationId,
          unassignedId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: '/occurrence-conversations/unassigned/:id/assign',
      policy: WRITE_POLICY,
    }),
  ]
}
