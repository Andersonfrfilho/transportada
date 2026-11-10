/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318 (T6): o canal do aviso de ocorrência na tela da contratante. Tudo é `settings.manage` — o número a marcar
 * é dado de contato, e o separador (que lê a frota) não alcança nenhuma rota. O teste manda mensagem de verdade ao
 * grupo e conta no Postgres.
 */
import { z } from 'zod'

import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_CONTRACTOR_OCCURRENCE_CHANNEL_GROUPS_PATH,
  API_CONTRACTOR_OCCURRENCE_CHANNEL_PATH,
  API_CONTRACTOR_OCCURRENCE_CHANNEL_TEST_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { WHATSAPP_GROUP_JID_PATTERN } from '../../fleet/presentation/driver-whatsapp-group.schema.js'
import { toWhatsAppPhone } from '../../whatsapp-commands/domain/whatsapp-phone.policy.js'
import type {
  ContractorOccurrenceChannelSettings,
  ContractorOccurrenceChannelUseCase,
} from '../application/contractor-occurrence-channel.use-case.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

export const CONTRACTOR_OCCURRENCE_CHANNEL_TEST_RATE_LIMIT = {
  maxRequests: 10,
  scope: 'contractor-occurrence-channel-test',
  store: 'postgres',
  windowSeconds: 300,
} as const

const GROUP_NAME_MAX_LENGTH = 200

const saveBodySchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('email'), emailFallback: z.boolean().default(true) }).strict(),
  z
    .object({
      channel: z.literal('whatsapp_group'),
      emailFallback: z.boolean(),
      groupJid: z.string().max(80).regex(WHATSAPP_GROUP_JID_PATTERN),
      groupName: z.string().trim().max(GROUP_NAME_MAX_LENGTH).default(''),
      /** Digitado como a pessoa escreve; gravado só com dígitos e o 55 (`toWhatsAppPhone`). */
      mentionPhone: z
        .string()
        .max(32)
        .transform((value, context) => {
          const phone = toWhatsAppPhone(value)
          if (phone === undefined) {
            context.addIssue({ code: 'custom', message: 'invalid WhatsApp phone' })
            return z.NEVER
          }
          return phone
        }),
    })
    .strict(),
])

type ContractorInput = { readonly contractorId: string; readonly correlationId: string }

export function createContractorOccurrenceChannelRoutes(dependencies: {
  readonly useCase: ContractorOccurrenceChannelUseCase
}): readonly ReturnType<typeof defineRoute>[] {
  const { useCase } = dependencies
  const parseContractor = ({
    correlationId,
    pathParameters,
  }: {
    readonly correlationId: string
    readonly pathParameters: Readonly<Record<string, string | undefined>>
  }): ContractorInput => ({
    contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
    correlationId,
  })
  return [
    defineRoute<ContractorInput>({
      async handle({ context, input }) {
        const channel = await useCase.get({
          companyId: context.scope.companyId,
          contractorId: input.contractorId,
        })
        return jsonResponse(200, { data: channel })
      },
      method: 'GET',
      parse: parseContractor,
      pathname: API_CONTRACTOR_OCCURRENCE_CHANNEL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ContractorInput & { readonly settings: ContractorOccurrenceChannelSettings }>({
      async handle({ context, input }) {
        const channel = await useCase.save({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          contractorId: input.contractorId,
          correlationId: input.correlationId,
          ...input.settings,
        })
        return jsonResponse(200, { data: channel })
      },
      method: 'PUT',
      async parse(parameters) {
        const settings = (await parseBody(
          saveBodySchema,
          parameters.request,
        )) as ContractorOccurrenceChannelSettings
        return { ...parseContractor(parameters), settings }
      },
      pathname: API_CONTRACTOR_OCCURRENCE_CHANNEL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ContractorInput>({
      async handle({ context, input }) {
        const result = await useCase.sendTest({
          companyId: context.scope.companyId,
          contractorId: input.contractorId,
        })
        return jsonResponse(200, { data: result })
      },
      method: 'POST',
      parse: parseContractor,
      pathname: API_CONTRACTOR_OCCURRENCE_CHANNEL_TEST_PATH,
      policy: SETTINGS_MANAGE_POLICY,
      rateLimit: CONTRACTOR_OCCURRENCE_CHANNEL_TEST_RATE_LIMIT,
    }),
    defineRoute<undefined>({
      async handle({ context }) {
        const groups = await useCase.listGroups({ companyId: context.scope.companyId })
        return jsonResponse(200, { data: groups })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_CONTRACTOR_OCCURRENCE_CHANNEL_GROUPS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}
