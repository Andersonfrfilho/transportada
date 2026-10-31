/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T4: configurar o Evolution e conectar o número é `settings.manage`, como o canal da Meta.
 */
import { z } from 'zod'

import {
  WHATSAPP_DEFAULT_PROVIDERS,
  WHATSAPP_EVOLUTION_DAILY_CAP_RANGE,
  WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE,
  WHATSAPP_EVOLUTION_STATUSES,
} from '../../database/whatsapp-evolution.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_WHATSAPP_EVOLUTION_CONNECTION_PATH,
  API_WHATSAPP_EVOLUTION_DISCONNECT_PATH,
  API_WHATSAPP_EVOLUTION_REVEAL_PATH,
  API_WHATSAPP_EVOLUTION_PATH,
  API_WHATSAPP_EVOLUTION_PROVISION_PATH,
  API_WHATSAPP_EVOLUTION_QR_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  SaveWhatsAppEvolutionValues,
  WhatsAppEvolutionSummary,
} from '../application/whatsapp-evolution.port.js'
import type {
  WhatsAppEvolutionConnection,
  WhatsAppEvolutionQr,
} from '../application/whatsapp-evolution.use-case.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

const saveSchema = z
  .object({
    acknowledgeRisk: z.boolean().optional(),
    /** Opcional na atualização: ninguém relê a chave para redigitá-la. */
    apiKey: z.string().trim().min(1).max(500).optional(),
    baseUrl: z.string().trim().min(1).max(255),
    dailyCap: z
      .number()
      .int()
      .min(WHATSAPP_EVOLUTION_DAILY_CAP_RANGE.min)
      .max(WHATSAPP_EVOLUTION_DAILY_CAP_RANGE.max),
    defaultProvider: z.enum(WHATSAPP_DEFAULT_PROVIDERS).optional(),
    instanceName: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,64}$/u),
    minIntervalSeconds: z
      .number()
      .int()
      .min(WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE.min)
      .max(WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE.max),
    status: z.enum(WHATSAPP_EVOLUTION_STATUSES).optional(),
  })
  .strict()

type ActorInput = { readonly correlationId: string }

const provisionSchema = z.object({ acknowledgeRisk: z.boolean() }).strict()

export type WhatsAppEvolutionRoutesDependencies = {
  readonly provision: {
    execute(
      input: ActorInput & {
        readonly acknowledgeRisk: boolean
        readonly context: CompanyContext
      },
    ): Promise<WhatsAppEvolutionSummary>
  }
  /** O ambiente tem a chave global do Evolution: a tela oferece "Criar e conectar". */
  readonly provisioningAvailable: boolean
  readonly connection: {
    execute(
      input: ActorInput & { readonly context: CompanyContext },
    ): Promise<WhatsAppEvolutionConnection>
  }
  readonly disconnect: {
    execute(
      input: ActorInput & { readonly context: CompanyContext },
    ): Promise<WhatsAppEvolutionConnection>
  }
  readonly reveal: {
    execute(
      input: ActorInput & { readonly context: CompanyContext },
    ): Promise<{ readonly ownerNumber: null | string }>
  }
  readonly qr: {
    execute(input: ActorInput & { readonly context: CompanyContext }): Promise<WhatsAppEvolutionQr>
  }
  readonly read: {
    execute(input: { readonly context: CompanyContext }): Promise<WhatsAppEvolutionSummary | null>
  }
  readonly save: {
    execute(
      input: ActorInput & {
        readonly context: CompanyContext
        readonly values: SaveWhatsAppEvolutionValues
      },
    ): Promise<WhatsAppEvolutionSummary>
  }
}

export function createWhatsAppEvolutionRoutes(
  dependencies: WhatsAppEvolutionRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.read.execute({ context: context.scope })
        return jsonResponse(200, {
          data: settings === null ? null : serializeSettings(settings),
          provisioningAvailable: dependencies.provisioningAvailable,
        })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_WHATSAPP_EVOLUTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ActorInput & { readonly values: SaveWhatsAppEvolutionValues }>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.save.execute({ context: context.scope, ...input })
        return jsonResponse(200, { data: serializeSettings(settings) })
      },
      method: 'PUT',
      async parse({ correlationId, request }) {
        const body = await parseBody(saveSchema, request)
        return {
          correlationId,
          values: {
            acknowledgeRisk: body.acknowledgeRisk ?? false,
            ...(body.apiKey === undefined ? {} : { apiKey: body.apiKey }),
            baseUrl: body.baseUrl,
            dailyCap: body.dailyCap,
            defaultProvider: body.defaultProvider ?? 'meta',
            instanceName: body.instanceName,
            minIntervalSeconds: body.minIntervalSeconds,
            status: body.status ?? 'disabled',
          },
        }
      },
      pathname: API_WHATSAPP_EVOLUTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ActorInput>({
      async handle({ context, input }): Promise<Response> {
        const connection = await dependencies.connection.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse(200, { data: connection })
      },
      method: 'GET',
      parse: ({ correlationId }) => ({ correlationId }),
      pathname: API_WHATSAPP_EVOLUTION_CONNECTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ActorInput & { readonly acknowledgeRisk: boolean }>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.provision.execute({ context: context.scope, ...input })
        return jsonResponse(200, { data: serializeSettings(settings) })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        const body = await parseBody(provisionSchema, request)
        return { acknowledgeRisk: body.acknowledgeRisk, correlationId }
      },
      pathname: API_WHATSAPP_EVOLUTION_PROVISION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ActorInput>({
      async handle({ context, input }): Promise<Response> {
        const connection = await dependencies.disconnect.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse(200, { data: connection })
      },
      method: 'POST',
      parse: ({ correlationId }) => ({ correlationId }),
      pathname: API_WHATSAPP_EVOLUTION_DISCONNECT_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ActorInput>({
      async handle({ context, input }): Promise<Response> {
        const revealed = await dependencies.reveal.execute({ context: context.scope, ...input })
        return jsonResponse(200, { data: revealed })
      },
      method: 'POST',
      parse: ({ correlationId }) => ({ correlationId }),
      pathname: API_WHATSAPP_EVOLUTION_REVEAL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<ActorInput>({
      async handle({ context, input }): Promise<Response> {
        const qr = await dependencies.qr.execute({ context: context.scope, ...input })
        return jsonResponse(200, { data: qr })
      },
      method: 'POST',
      parse: ({ correlationId }) => ({ correlationId }),
      pathname: API_WHATSAPP_EVOLUTION_QR_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

/** Lista fechada, e sem chave — nem mascarada: o que a tela precisa saber é `apiKeyConfigured`. */
function serializeSettings(settings: WhatsAppEvolutionSummary): Record<string, unknown> {
  return {
    apiKeyConfigured: settings.apiKeyConfigured,
    baseUrl: settings.baseUrl,
    connectionCheckedAt: settings.connectionCheckedAt,
    connectionState: settings.connectionState,
    createdAt: settings.createdAt,
    dailyCap: settings.dailyCap,
    defaultProvider: settings.defaultProvider,
    id: settings.id,
    instanceName: settings.instanceName,
    minIntervalSeconds: settings.minIntervalSeconds,
    riskAcknowledgedAt: settings.riskAcknowledgedAt,
    status: settings.status,
    updatedAt: settings.updatedAt,
    version: settings.version,
  }
}

/** `no-store`: a resposta do QR é credencial de pareamento do número e não pode ficar em cache. */
function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}
