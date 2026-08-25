/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  defineAnonymousRoute,
  defineRoute,
  type RegisteredAnonymousRoute,
} from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_LANDING_PATH,
  API_PUBLIC_LANDING_SETTINGS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  LandingSettingsUseCase,
  LandingSettingsWriteRequest,
  PublicLandingSettings,
} from '../application/landing-settings.use-case.js'
import type { LandingSettingsRecord } from '../application/landing-settings.port.js'
import { parseLandingSettingsRequest } from './landing.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
/** Cacheável na borda: a marca e as unidades mudam raramente, e a rota não carrega dado por sessão. */
const PUBLIC_CACHE_CONTROL = 'public, max-age=300'

type Dependencies = {
  readonly landingSettings: LandingSettingsUseCase
}

export function createLandingPublicRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<undefined>({
      async handle(): Promise<Response> {
        const settings = await dependencies.landingSettings.getPublic()
        return jsonResponse({
          body: { data: serializePublic(settings) },
          cacheControl: PUBLIC_CACHE_CONTROL,
          status: 200,
        })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_PUBLIC_LANDING_SETTINGS_PATH,
    }),
  ]
}

export function createLandingSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const settings = await dependencies.landingSettings.getForCompany({ context: context.scope })
        return jsonResponse({
          body: { data: settings === null ? null : serialize(settings) },
          cacheControl: 'no-store',
          status: 200,
        })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_LANDING_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<LandingSettingsWriteRequest>({
      async handle({ context, input }): Promise<Response> {
        const settings = await dependencies.landingSettings.update({ context: context.scope, ...input })
        return jsonResponse({
          body: { data: serialize(settings) },
          cacheControl: 'no-store',
          status: 200,
        })
      },
      method: 'PUT',
      parse: ({ request }) => parseLandingSettingsRequest(request),
      pathname: API_COMPANY_SETTINGS_LANDING_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: {
  readonly body: object
  readonly cacheControl: string
  readonly status: number
}): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': input.cacheControl, 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serialize(settings: LandingSettingsRecord): object {
  return {
    accentColor: settings.accentColor ?? null,
    brandName: settings.brandName ?? null,
    contactEmail: settings.contactEmail ?? null,
    contactPhone: settings.contactPhone ?? null,
    sections: settings.sections,
    updatedAt: settings.updatedAt.toISOString(),
  }
}

function serializePublic(settings: PublicLandingSettings): object {
  return {
    accentColor: settings.accentColor ?? null,
    brandName: settings.brandName ?? null,
    contactEmail: settings.contactEmail ?? null,
    contactPhone: settings.contactPhone ?? null,
    sections: settings.sections,
    units: settings.units.map((unit) => ({
      city: unit.city,
      // Não é sensível — é o alvo que POST /public/aggregate-applications exige quando o grupo
      // tem mais de uma unidade (T011); esconder companyId deixaria o select sem valor para enviar.
      companyId: unit.companyId,
      complement: unit.complement,
      district: unit.district,
      number: unit.number,
      phone: unit.phone,
      postalCode: unit.postalCode,
      state: unit.state,
      street: unit.street,
      tradeName: unit.tradeName,
    })),
  }
}
