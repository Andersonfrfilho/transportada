/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 062 T003: cadastrar a credencial é `settings.manage`, como a da Nota RP — quem configura o
 * canal decide por qual número a empresa fala com o cliente.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_WHATSAPP_CHANNEL_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { WHATSAPP_CHANNEL_STATUSES } from '../../database/whatsapp-channel.schema.js'
import type {
  SaveWhatsAppChannelValues,
  WhatsAppChannelSummary,
} from '../application/whatsapp-channel.port.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

const META_ID = /^[0-9]{5,32}$/u
const DISPLAY_NUMBER = /^[0-9]{10,15}$/u

const saveSchema = z
  .object({
    /**
     * Opcional **na atualização**: ninguém relê o token para redigitá-lo, então exigir aqui obrigaria
     * o operador a buscá-lo na Meta toda vez que corrigisse o número. Cadastro novo sem token é
     * recusado pelo caso de uso, com `422` e o campo nomeado.
     */
    accessToken: z.string().trim().min(1).optional(),
    displayPhoneNumber: z
      .union([z.literal(''), z.string().trim().regex(DISPLAY_NUMBER)])
      .optional(),
    phoneNumberId: z.string().trim().regex(META_ID),
    status: z.enum(WHATSAPP_CHANNEL_STATUSES).optional(),
    wabaId: z.string().trim().regex(META_ID),
  })
  .strict()

export type WhatsAppChannelRoutesDependencies = {
  readonly readChannel: {
    execute(input: { readonly context: CompanyContext }): Promise<WhatsAppChannelSummary | null>
  }
  readonly removeChannel: {
    execute(input: { readonly context: CompanyContext }): Promise<void>
  }
  readonly saveChannel: {
    execute(input: {
      readonly context: CompanyContext
      readonly values: SaveWhatsAppChannelValues
    }): Promise<WhatsAppChannelSummary>
  }
}

export function createWhatsAppChannelRoutes(
  dependencies: WhatsAppChannelRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        const channel = await dependencies.readChannel.execute({ context: context.scope })

        /** Empresa sem canal é `null`, não `404`: ausência é o caso normal, e a tela abre vazia. */
        return jsonResponse({
          body: { data: channel === null ? null : serializeChannel(channel) },
          status: 200,
        })
      },
      method: 'GET',
      parse: () => ({}) as Record<string, never>,
      pathname: API_WHATSAPP_CHANNEL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly values: SaveWhatsAppChannelValues }>({
      async handle({ context, input }): Promise<Response> {
        const channel = await dependencies.saveChannel.execute({
          context: context.scope,
          values: input.values,
        })

        return jsonResponse({ body: { data: serializeChannel(channel) }, status: 200 })
      },
      method: 'PUT',
      async parse({ request }) {
        const body = await parseBody(saveSchema, request)

        return {
          values: {
            ...(body.accessToken === undefined ? {} : { accessToken: body.accessToken }),
            displayPhoneNumber: body.displayPhoneNumber ?? '',
            phoneNumberId: body.phoneNumberId,
            status: body.status ?? 'active',
            wabaId: body.wabaId,
          },
        }
      },
      pathname: API_WHATSAPP_CHANNEL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        await dependencies.removeChannel.execute({ context: context.scope })

        return new Response(null, { status: 204 })
      },
      method: 'DELETE',
      parse: () => ({}) as Record<string, never>,
      pathname: API_WHATSAPP_CHANNEL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

/**
 * ⚠️ **A projeção é lista fechada, e não há token nela — nem mascarado.** Máscara que permite
 * confirmar um token é confirmação: quem tem o começo e o fim tem o suficiente para reconhecer o
 * segredo que vazou por outro caminho. O que a tela precisa saber é **se há** token, e isso é
 * `tokenConfigured`.
 */
function serializeChannel(channel: WhatsAppChannelSummary): Record<string, unknown> {
  return {
    createdAt: channel.createdAt,
    displayPhoneNumber: channel.displayPhoneNumber,
    id: channel.id,
    phoneNumberId: channel.phoneNumberId,
    status: channel.status,
    tokenConfigured: channel.tokenConfigured,
    updatedAt: channel.updatedAt,
    version: channel.version,
    wabaId: channel.wabaId,
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
