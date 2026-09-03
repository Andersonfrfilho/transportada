/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0057 §1: o painel decide o formulário do comprovante. O app **não** lê estas rotas — os
 * campos resolvidos viajam no snapshot de `GET /me/trips/current`.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseBody } from '../../http/request-parsing.service.js'
import {
  API_COMPANY_SETTINGS_DELIVERY_PROOF_OVERRIDES_PATH,
  API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { DeliveryProofFieldSettings } from '../domain/delivery-proof-settings.policy.js'
import type { DeliveryProofSettingsOverride } from '../infrastructure/drizzle-delivery-proof-settings.repository.js'
import {
  deliveryProofOverridesSchema,
  deliveryProofSettingsSchema,
} from './delivery-proof-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

export type DeliveryProofSettingsDependencies = {
  readonly listOverrides: (input: {
    readonly companyId: string
  }) => Promise<readonly DeliveryProofSettingsOverride[]>
  readonly readSettings: (input: {
    readonly companyId: string
  }) => Promise<DeliveryProofFieldSettings>
  readonly replaceOverrides: (input: {
    readonly companyId: string
    readonly overrides: readonly DeliveryProofSettingsOverride[]
  }) => Promise<void>
  readonly saveSettings: (input: {
    readonly companyId: string
    readonly settings: DeliveryProofFieldSettings
  }) => Promise<DeliveryProofFieldSettings>
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify({ data: body }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

export function createDeliveryProofSettingsRoutes(
  dependencies: DeliveryProofSettingsDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.readSettings({
          companyId: context.scope.companyId,
        })
        return jsonResponse(settings)
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<DeliveryProofFieldSettings>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.saveSettings({
          companyId: context.scope.companyId,
          settings: input,
        })
        return jsonResponse(settings)
      },
      method: 'PUT',
      parse: ({ request }) => parseBody(deliveryProofSettingsSchema, request),
      pathname: API_COMPANY_SETTINGS_DELIVERY_PROOF_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const overrides = await dependencies.listOverrides({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ overrides })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_DELIVERY_PROOF_OVERRIDES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly overrides: readonly DeliveryProofSettingsOverride[] }>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.replaceOverrides({
          companyId: context.scope.companyId,
          overrides: input.overrides,
        })
        const overrides = await dependencies.listOverrides({
          companyId: context.scope.companyId,
        })
        return jsonResponse({ overrides })
      },
      method: 'PUT',
      parse: ({ request }) => parseBody(deliveryProofOverridesSchema, request),
      pathname: API_COMPANY_SETTINGS_DELIVERY_PROOF_OVERRIDES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
