/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CompanyProfileLookupResult,
  CompanySettingsInput,
  CompanySettingsResult,
} from '../application/company-settings.port.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_CNPJ_LOOKUP_PATH,
  API_COMPANY_SETTINGS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  parseCompanySettingsLookupCnpjRequest,
  parseCompanySettingsRequest,
  parseIdempotencyKey,
} from './company-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

type Dependencies = {
  readonly getSettings: {
    execute(input: { readonly context: CompanyContext }): Promise<CompanySettingsResult | null>
  }
  readonly lookupProfileByCnpj: {
    execute(input: {
      readonly cnpj: string
      readonly context: CompanyContext
    }): Promise<CompanyProfileLookupResult | null>
  }
  readonly updateSettings: {
    execute(input: {
      readonly context: CompanyContext
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly settings: CompanySettingsInput
    }): Promise<CompanySettingsResult>
  }
}

type UpdateRouteInput = {
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly settings: CompanySettingsInput
}

export function createCompanySettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return settingsResponse(await dependencies.getSettings.execute({ context: context.scope }))
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<{ readonly cnpj: string }>({
      async handle({ context, input }): Promise<Response> {
        return lookupResponse(
          await dependencies.lookupProfileByCnpj.execute({
            cnpj: input.cnpj,
            context: context.scope,
          }),
        )
      },
      method: 'GET',
      parse: ({ request }) => ({ cnpj: parseCompanySettingsLookupCnpjRequest(request) }),
      pathname: API_COMPANY_SETTINGS_CNPJ_LOOKUP_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<UpdateRouteInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.updateSettings.execute({
          context: context.scope,
          ...input,
        })
        return settingsResponse(result)
      },
      method: 'PATCH',
      async parse({ correlationId, request }): Promise<UpdateRouteInput> {
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          settings: await parseCompanySettingsRequest(request),
        }
      },
      pathname: API_COMPANY_SETTINGS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function lookupResponse(profile: CompanyProfileLookupResult | null): Response {
  return new Response(JSON.stringify({ data: profile }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

function settingsResponse(settings: CompanySettingsResult | null): Response {
  return new Response(JSON.stringify({ data: serializeSettings(settings) }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

function serializeSettings(settings: CompanySettingsResult | null): object {
  if (settings === null) {
    return { cte: null, cteRetry: null, mdfe: null, profile: null }
  }
  return {
    cte: {
      environment: settings.cte.environment,
      nextNumber: settings.cte.nextNumber.toString(),
      series: settings.cte.series.toString(),
      version: settings.cte.version.toString(),
    },
    cteRetry: {
      backoffSeconds: [...settings.cteRetry.backoffSeconds],
      maxAttempts: settings.cteRetry.maxAttempts,
    },
    mdfe: {
      bankBranch: settings.mdfe.bankBranch,
      bankCode: settings.mdfe.bankCode,
      insurancePolicy: settings.mdfe.insurancePolicy,
      insuranceResponsibility: settings.mdfe.insuranceResponsibility,
      insurerName: settings.mdfe.insurerName,
      insurerTaxId: settings.mdfe.insurerTaxId,
      pixKey: settings.mdfe.pixKey,
    },
    profile: {
      city: settings.profile.city,
      cityIbgeCode: settings.profile.cityIbgeCode,
      cnpj: settings.profile.cnpj,
      complement: settings.profile.complement,
      district: settings.profile.district,
      email: settings.profile.email,
      legalName: settings.profile.legalName,
      municipalRegistration: settings.profile.municipalRegistration,
      number: settings.profile.number,
      phone: settings.profile.phone,
      postalCode: settings.profile.postalCode,
      rntrc: settings.profile.rntrc,
      state: settings.profile.state,
      stateRegistration: settings.profile.stateRegistration,
      street: settings.profile.street,
      taxRegime: settings.profile.taxRegime,
      tradeName: settings.profile.tradeName,
      version: settings.profile.version.toString(),
    },
  }
}
