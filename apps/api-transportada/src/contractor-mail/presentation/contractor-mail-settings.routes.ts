/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_CONTRACTOR_MAIL_SETTINGS_CHECKS_PATH,
  API_CONTRACTOR_MAIL_SETTINGS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ContractorMailCheckItem,
  ContractorMailSettingsSummary,
} from '../application/contractor-mail-settings.use-case.js'
import { parseSaveContractorMailSettingsRequest } from './contractor-mail-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type SaveInput = {
  readonly apiKey: string | undefined
  readonly correlationId: string
  readonly replyDomain: string
  readonly senderAddress: string
  readonly senderName: string
  readonly webhookSigningSecret: string | undefined
}

type Dependencies = {
  readonly read: {
    execute(input: {
      readonly context: CompanyContext
    }): Promise<ContractorMailSettingsSummary | null>
  }
  readonly runChecks: {
    execute(input: {
      readonly context: CompanyContext
    }): Promise<readonly ContractorMailCheckItem[]>
  }
  readonly save: {
    execute(
      input: SaveInput & { readonly context: CompanyContext },
    ): Promise<ContractorMailSettingsSummary>
  }
}

export function createContractorMailSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.read.execute({ context: context.scope })
        return jsonResponse({ data: settings === null ? null : serializeSettings(settings) })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_CONTRACTOR_MAIL_SETTINGS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.save.execute({ context: context.scope, ...input })
        return jsonResponse({ data: serializeSettings(settings) })
      },
      method: 'PUT',
      async parse({ correlationId, request }) {
        const body = await parseSaveContractorMailSettingsRequest(request)
        return {
          apiKey: body.apiKey,
          correlationId,
          replyDomain: body.replyDomain,
          senderAddress: body.senderAddress,
          senderName: body.senderName,
          webhookSigningSecret: body.webhookSigningSecret,
        }
      },
      pathname: API_CONTRACTOR_MAIL_SETTINGS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const checks = await dependencies.runChecks.execute({ context: context.scope })
        return jsonResponse({ data: checks })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_CONTRACTOR_MAIL_SETTINGS_CHECKS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

/**
 * Lista fechada de campos, como em `nfse-provider-credentials.routes.ts`: um campo novo no
 * agregado só vaza se alguém o acrescentar aqui, à mão, um a um.
 */
function serializeSettings(settings: ContractorMailSettingsSummary): Record<string, unknown> {
  return {
    apiKeyConfigured: settings.apiKeyConfigured,
    id: settings.id,
    lastWebhookAt: settings.lastWebhookAt,
    replyDomain: settings.replyDomain,
    senderAddress: settings.senderAddress,
    senderName: settings.senderName,
    status: settings.status,
    webhookId: settings.webhookId,
    webhookSecretConfigured: settings.webhookSecretConfigured,
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: NO_STORE_HEADERS, status: 200 })
}
