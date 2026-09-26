/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T701 (RF12): as rotas das respostas rápidas. O cadastro (listar todas, criar, editar,
 * ativar/desativar e reordenar) é `settings.manage`, como os outros cadastros da empresa; o
 * compositor da conversa lê as ativas do público com `occurrences.resolve`, a mesma permissão de
 * quem escreve. `no-store` em tudo: é texto da empresa, e a tela precisa do que acabou de gravar.
 */
import { z } from 'zod'

import {
  COMPANY_QUICK_REPLY_AUDIENCES,
  COMPANY_QUICK_REPLY_MAX_LENGTH,
  type CompanyQuickReplyAudience,
} from '../../database/occurrence-conversation.schema.js'
import {
  invalidRequest,
  parseBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { QuickRepliesUseCase } from '../application/quick-replies.use-case.js'
import type { QuickReplyRecord } from '../application/quick-replies.port.js'

const MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const COMPOSE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const QUICK_REPLIES_PATH = '/company-settings/quick-replies'
const COMPOSER_PATH = '/occurrence-quick-replies'
/** O teto de uma reordenação: mais do que isso não é resposta rápida, é catálogo. */
const MAX_REORDER = 200

const audienceSchema = z.enum(COMPANY_QUICK_REPLY_AUDIENCES)
/** O limite do corpo acompanha o do banco; o aparado e o mínimo são do caso de uso (422). */
const textSchema = z.string().max(COMPANY_QUICK_REPLY_MAX_LENGTH * 2)

const createSchema = z.object({ audience: audienceSchema, text: textSchema }).strict()
const updateSchema = z
  .object({ active: z.boolean().optional(), text: textSchema.optional() })
  .strict()
  .refine((body) => body.active !== undefined || body.text !== undefined)
const orderSchema = z
  .object({ audience: audienceSchema, ids: z.array(z.string().uuid()).max(MAX_REORDER) })
  .strict()

export type QuickReplyRoutesDependencies = {
  readonly quickReplies: QuickRepliesUseCase
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status,
  })
}

function serialize(reply: QuickReplyRecord): Record<string, unknown> {
  return {
    active: reply.active,
    audience: reply.audience,
    id: reply.id,
    position: reply.position,
    text: reply.bodyText,
  }
}

export function createQuickReplyRoutes(
  dependencies: QuickReplyRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const replies = await dependencies.quickReplies.listAll({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: replies.map(serialize) })
      },
      method: 'GET',
      parse: () => ({}) as Record<string, never>,
      pathname: QUICK_REPLIES_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly audience: CompanyQuickReplyAudience; readonly bodyText: string }>({
      async handle({ context, input }): Promise<Response> {
        const reply = await dependencies.quickReplies.create({
          audience: input.audience,
          bodyText: input.bodyText,
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: serialize(reply) }, 201)
      },
      method: 'POST',
      async parse({ request }) {
        const body = await parseBody(createSchema, request)
        return { audience: body.audience, bodyText: body.text }
      },
      pathname: QUICK_REPLIES_PATH,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly audience: CompanyQuickReplyAudience; readonly ids: readonly string[] }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.quickReplies.reorder({
          audience: input.audience,
          companyId: context.scope.companyId,
          ids: input.ids,
        })
        const replies = await dependencies.quickReplies.listAll({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: replies.map(serialize) })
      },
      method: 'PUT',
      parse: async ({ request }) => parseBody(orderSchema, request),
      pathname: `${QUICK_REPLIES_PATH}/order`,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly active?: boolean; readonly bodyText?: string; readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const reply = await dependencies.quickReplies.update({
          companyId: context.scope.companyId,
          id: input.id,
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(input.bodyText === undefined ? {} : { bodyText: input.bodyText }),
        })
        return jsonResponse({ data: serialize(reply) })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        const id = parseUuidPathIdentifier(pathParameters.id ?? '')
        const body = await parseBody(updateSchema, request)
        return {
          id,
          ...(body.active === undefined ? {} : { active: body.active }),
          ...(body.text === undefined ? {} : { bodyText: body.text }),
        }
      },
      pathname: `${QUICK_REPLIES_PATH}/:id`,
      policy: MANAGE_POLICY,
    }),
    defineRoute<{ readonly audience: CompanyQuickReplyAudience }>({
      async handle({ context, input }): Promise<Response> {
        const replies = await dependencies.quickReplies.listForComposer({
          audience: input.audience,
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: replies.map(serialize) })
      },
      method: 'GET',
      parse: ({ request }) => {
        const audience = audienceSchema.safeParse(new URL(request.url).searchParams.get('audience'))
        if (!audience.success) throw invalidRequest()
        return { audience: audience.data }
      },
      pathname: COMPOSER_PATH,
      policy: COMPOSE_POLICY,
    }),
  ]
}
