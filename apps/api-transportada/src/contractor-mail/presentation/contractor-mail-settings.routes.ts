/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RateLimitCeiling } from '../../http/rate-limiter.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_CONTRACTOR_MAIL_SETTINGS_CHECKS_PATH,
  API_CONTRACTOR_MAIL_SETTINGS_PATH,
  API_CONTRACTOR_MAIL_TEST_EMAIL_PATH,
  CONTRACTOR_MAIL_RATE_LIMIT_SCOPE,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ContractorMailCheckItem,
  ContractorMailSettingsSummary,
} from '../application/contractor-mail-settings.use-case.js'
import type { SendContractorMailTestEmailResult } from '../application/send-contractor-mail-test-email.use-case.js'
import { parseSaveContractorMailSettingsRequest } from './contractor-mail-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type SaveInput = {
  readonly apiKey: string | undefined
  readonly correlationId: string
  readonly expectedVersion: string | undefined
  readonly replyDomain: string
  readonly senderAddress: string
  readonly senderName: string
  readonly webhookSigningSecret: string | undefined
}

type SendTestEmailInput = {
  readonly correlationId: string
}

type Dependencies = {
  /** Spec 150 RF18: o e-mail de teste gasta o mesmo teto do envio de correção. */
  readonly mailRateLimit: RateLimitCeiling
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
  readonly sendTestEmail: {
    execute(
      input: SendTestEmailInput & { readonly context: CompanyContext },
    ): Promise<SendContractorMailTestEmailResult>
  }
}

export function createContractorMailSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.read.execute({ context: context.scope })
        return jsonResponse({
          body: { data: settings === null ? null : serializeSettings(settings) },
        })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_CONTRACTOR_MAIL_SETTINGS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.save.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeSettings(settings) } })
      },
      method: 'PUT',
      async parse({ correlationId, request }) {
        const body = await parseSaveContractorMailSettingsRequest(request)
        return {
          apiKey: body.apiKey,
          correlationId,
          expectedVersion: body.expectedVersion,
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
        return jsonResponse({ body: { data: checks } })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_CONTRACTOR_MAIL_SETTINGS_CHECKS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SendTestEmailInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.sendTestEmail.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: result }, status: 202 })
      },
      method: 'POST',
      parse: ({ correlationId }) => ({ correlationId }),
      pathname: API_CONTRACTOR_MAIL_TEST_EMAIL_PATH,
      policy: SETTINGS_MANAGE_POLICY,
      rateLimit: {
        ...dependencies.mailRateLimit,
        scope: CONTRACTOR_MAIL_RATE_LIMIT_SCOPE,
        store: 'postgres',
      },
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
    sendingVerifiedAt: settings.sendingVerifiedAt,
    status: settings.status,
    version: settings.version,
    webhookId: settings.webhookId,
    webhookSecretConfigured: settings.webhookSecretConfigured,
  }
}

function jsonResponse(input: { readonly body: unknown; readonly status?: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: NO_STORE_HEADERS,
    status: input.status ?? 200,
  })
}
