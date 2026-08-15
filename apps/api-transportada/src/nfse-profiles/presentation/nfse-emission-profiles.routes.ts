/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_NFSE_EMISSION_PROFILES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  NfseEmissionProfileDetail,
  NfseEmissionProfileFilters,
  NfseEmissionProfileOption,
  NfseEmissionProfilePage,
} from '../application/nfse-profile.port.js'
import type {
  ChangeNfseEmissionProfileStatusInput,
  CreateNfseEmissionProfileInput,
  ListNfseEmissionProfileOptionsInput,
  ListNfseEmissionProfilesInput,
  UpdateNfseEmissionProfileInput,
} from '../application/nfse-emission-profiles.use-case.js'
import {
  parseChangeProfileStatusRequest,
  parseCreateProfileRequest,
  parseIdempotencyKey,
  parseProfileList,
  parseUpdateProfileRequest,
  parseUuidPathIdentifier,
} from './nfse-profiles.schema.js'

/**
 * Emitir e administrar são papéis diferentes. `nfse.issue` abre só as opções — a listagem inteira,
 * com alíquota, CNAE e tomador, continua atrás de `settings.manage`.
 */
const NFSE_ISSUE_POLICY = { permission: 'nfse.issue', scope: 'company' } as const
const OPTIONS_PATH = `${API_NFSE_EMISSION_PROFILES_PATH}/options`
const PROFILE_PATH = `${API_NFSE_EMISSION_PROFILES_PATH}/:id`
const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const STATUS_PATH = `${PROFILE_PATH}/status`

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type ListInput = {
  readonly cursor: string | null
  readonly filters?: NfseEmissionProfileFilters
  readonly limit: number
}

type StatusInput = Omit<ChangeNfseEmissionProfileStatusInput, 'context'> & {
  readonly status: 'active' | 'inactive'
}

type Dependencies = {
  readonly activateProfile: {
    execute(
      input: TenantInput<ChangeNfseEmissionProfileStatusInput>,
    ): Promise<NfseEmissionProfileDetail>
  }
  readonly createProfile: {
    execute(input: TenantInput<CreateNfseEmissionProfileInput>): Promise<NfseEmissionProfileDetail>
  }
  readonly deactivateProfile: {
    execute(
      input: TenantInput<ChangeNfseEmissionProfileStatusInput>,
    ): Promise<NfseEmissionProfileDetail>
  }
  readonly listProfileOptions: {
    execute(
      input: TenantInput<ListNfseEmissionProfileOptionsInput>,
    ): Promise<readonly NfseEmissionProfileOption[]>
  }
  readonly listProfiles: {
    execute(input: TenantInput<ListNfseEmissionProfilesInput>): Promise<NfseEmissionProfilePage>
  }
  readonly updateProfile: {
    execute(input: TenantInput<UpdateNfseEmissionProfileInput>): Promise<NfseEmissionProfileDetail>
  }
}

export function createNfseEmissionProfileRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<ListInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listProfiles.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: { data: page.items.map(serializeProfile), page: { nextCursor: page.nextCursor } },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseProfileList(new URL(request.url)),
      pathname: API_NFSE_EMISSION_PROFILES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const options = await dependencies.listProfileOptions.execute({ context: context.scope })
        return jsonResponse({ body: { data: options.map(serializeProfileOption) }, status: 200 })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: OPTIONS_PATH,
      policy: NFSE_ISSUE_POLICY,
    }),
    defineRoute<Omit<CreateNfseEmissionProfileInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const profile = await dependencies.createProfile.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeProfile(profile) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return {
          correlationId,
          idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
          ...(await parseCreateProfileRequest(request)),
        }
      },
      pathname: API_NFSE_EMISSION_PROFILES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Omit<UpdateNfseEmissionProfileInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const profile = await dependencies.updateProfile.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeProfile(profile) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        return {
          correlationId,
          profileId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(await parseUpdateProfileRequest(request)),
        }
      },
      pathname: PROFILE_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<StatusInput>({
      async handle({ context, input }): Promise<Response> {
        const { status, ...transition } = input
        const useCase =
          status === 'active' ? dependencies.activateProfile : dependencies.deactivateProfile
        const profile = await useCase.execute({ context: context.scope, ...transition })
        return jsonResponse({ body: { data: serializeProfile(profile) }, status: 200 })
      },
      method: 'PATCH',
      async parse({ correlationId, pathParameters, request }) {
        return {
          correlationId,
          profileId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(await parseChangeProfileStatusRequest(request)),
        }
      },
      pathname: STATUS_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

/** Campo a campo de propósito: um parâmetro fiscal novo no perfil não escorrega para cá sozinho. */
function serializeProfileOption(option: NfseEmissionProfileOption): object {
  return {
    descriptionTemplate: option.descriptionTemplate,
    id: option.id,
    name: option.name,
  }
}

function serializeProfile(profile: NfseEmissionProfileDetail): object {
  return {
    chargeComponentLabel: profile.chargeComponentLabel,
    cnaeCode: profile.cnaeCode,
    companyId: profile.companyId,
    createdAt: profile.createdAt,
    descriptionMaxLength: profile.descriptionMaxLength,
    descriptionTemplate: profile.descriptionTemplate,
    freightRuleId: profile.freightRuleId,
    id: profile.id,
    issExigibility: profile.issExigibility,
    issRate: profile.issRate,
    issWithheld: profile.issWithheld,
    municipalityIbgeCode: profile.municipalityIbgeCode,
    municipalityName: profile.municipalityName,
    municipalTaxationCode: profile.municipalTaxationCode,
    name: profile.name,
    nbsCode: profile.nbsCode,
    observations: profile.observations,
    serviceListItem: profile.serviceListItem,
    status: profile.status,
    taker: profile.taker,
    updatedAt: profile.updatedAt,
    version: profile.version,
  }
}
