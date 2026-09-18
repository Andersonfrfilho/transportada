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
import type {
  CompanyDeliveryProofSettings,
  DeliveryProofFieldSettings,
  DeliveryProofPunctualitySettings,
  DeliveryProofSettingsInput,
} from '../domain/delivery-proof-settings.policy.js'
import type { DeliveryProofSettingsOverride } from '../infrastructure/drizzle-delivery-proof-settings.repository.js'
import {
  companyDeliveryProofSettingsSchema,
  deliveryProofOverridesSchema,
} from './delivery-proof-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

export type DeliveryProofSettingsDependencies = {
  readonly listOverrides: (input: {
    readonly companyId: string
  }) => Promise<readonly DeliveryProofSettingsOverride[]>
  readonly readSettings: (input: {
    readonly companyId: string
  }) => Promise<CompanyDeliveryProofSettings>
  readonly replaceOverrides: (input: {
    readonly companyId: string
    readonly overrides: readonly DeliveryProofSettingsOverride[]
  }) => Promise<void>
  readonly saveSettings: (input: {
    readonly companyId: string
    readonly settings: DeliveryProofSettingsInput
  }) => Promise<CompanyDeliveryProofSettings>
}

/**
 * Spec 159 T11 (item 6): os modos sempre vêm; os parâmetros da nota, só os que mudam. O interruptor
 * da leitura do canhoto (ADR-0069 §6) é opcional do mesmo jeito.
 */
type CompanyDeliveryProofSettingsInput = DeliveryProofFieldSettings & {
  readonly [TKey in keyof DeliveryProofPunctualitySettings]?:
    | DeliveryProofPunctualitySettings[TKey]
    | undefined
} & {
  readonly canhotoOcrEnabled?: boolean | undefined
}

/**
 * O que não veio fica como está gravado — `undefined` nunca sobrescreve um número. O interruptor do
 * canhoto não é completado com o gravado: ausente segue ausente até o repositório, que não o toca.
 */
function mergeSettings(
  stored: DeliveryProofPunctualitySettings,
  input: CompanyDeliveryProofSettingsInput,
): DeliveryProofSettingsInput {
  const provided = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as DeliveryProofFieldSettings &
    Partial<DeliveryProofPunctualitySettings> & { readonly canhotoOcrEnabled?: boolean }

  return {
    latePenaltyPoints: stored.latePenaltyPoints,
    missingAfterHours: stored.missingAfterHours,
    missingPenaltyPoints: stored.missingPenaltyPoints,
    proofRadiusMeters: stored.proofRadiusMeters,
    proofWindowMinutes: stored.proofWindowMinutes,
    ...provided,
  }
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
    defineRoute<CompanyDeliveryProofSettingsInput>({
      async handle({ context, input }): Promise<Response> {
        const companyId = context.scope.companyId
        const stored = await dependencies.readSettings({ companyId })
        const settings = await dependencies.saveSettings({
          companyId,
          settings: mergeSettings(stored, input),
        })
        return jsonResponse(settings)
      },
      method: 'PUT',
      parse: ({ request }) => parseBody(companyDeliveryProofSettingsSchema, request),
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
