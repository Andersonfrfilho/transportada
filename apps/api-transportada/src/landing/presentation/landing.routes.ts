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
  API_PUBLIC_LANDING_LOGO_PATH,
  API_PUBLIC_LANDING_SETTINGS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { LandingLogoUseCase } from '../application/landing-logo.use-case.js'
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
/** A logo muda ainda menos que a marca — e o ETag já cobre a troca, então a borda pode guardar mais. */
const PUBLIC_LOGO_CACHE_CONTROL = 'public, max-age=3600'

type PublicRoutesDependencies = {
  readonly landingLogo: LandingLogoUseCase
  readonly landingSettings: LandingSettingsUseCase
}

type SettingsRoutesDependencies = {
  readonly landingSettings: LandingSettingsUseCase
}

export function createLandingPublicRoutes(
  dependencies: PublicRoutesDependencies,
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
    defineAnonymousRoute<undefined>({
      // Ausência de logo não é erro — é o caso comum enquanto o operador não configurou uma
      // marca própria (aba Site). 404 aqui é só "não há imagem", o cliente cai no ícone padrão.
      async handle(): Promise<Response> {
        const logo = await dependencies.landingLogo.getPublicLogo()
        if (logo === null) return new Response(null, { status: 404 })

        return new Response(logo.bytes, {
          headers: {
            'cache-control': PUBLIC_LOGO_CACHE_CONTROL,
            'content-type': logo.mimeType,
            etag: `"${logo.sha256}"`,
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_PUBLIC_LANDING_LOGO_PATH,
    }),
  ]
}

export function createLandingSettingsRoutes(
  dependencies: SettingsRoutesDependencies,
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
