/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_CTE_EMISSION_PROFILES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  CteEmissionProfileDetail,
  CteEmissionProfileFilters,
  CteEmissionProfilePage,
} from '../application/cte-emission-profile.port.js'
import type {
  ChangeCteEmissionProfileStatusInput,
  CreateCteEmissionProfileInput,
  ListCteEmissionProfilesInput,
  UpdateCteEmissionProfileInput,
} from '../application/cte-emission-profiles.use-case.js'
import {
  parseChangeProfileStatusRequest,
  parseCreateProfileRequest,
  parseIdempotencyKey,
  parseProfileList,
  parseUpdateProfileRequest,
  parseUuidPathIdentifier,
} from './cte-emission-profiles.schema.js'

const PROFILE_PATH = `${API_CTE_EMISSION_PROFILES_PATH}/:id`
const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const STATUS_PATH = `${PROFILE_PATH}/status`

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type ListInput = {
  readonly cursor: string | null
  readonly filters?: CteEmissionProfileFilters
  readonly limit: number
}

type StatusInput = Omit<ChangeCteEmissionProfileStatusInput, 'context'> & {
  readonly status: 'active' | 'inactive'
}

type Dependencies = {
  readonly activateProfile: {
    execute(
      input: TenantInput<ChangeCteEmissionProfileStatusInput>,
    ): Promise<CteEmissionProfileDetail>
  }
  readonly createProfile: {
    execute(input: TenantInput<CreateCteEmissionProfileInput>): Promise<CteEmissionProfileDetail>
  }
  readonly deactivateProfile: {
    execute(
      input: TenantInput<ChangeCteEmissionProfileStatusInput>,
    ): Promise<CteEmissionProfileDetail>
  }
  readonly listProfiles: {
    execute(input: TenantInput<ListCteEmissionProfilesInput>): Promise<CteEmissionProfilePage>
  }
  readonly updateProfile: {
    execute(input: TenantInput<UpdateCteEmissionProfileInput>): Promise<CteEmissionProfileDetail>
  }
}

export function createCteEmissionProfileRoutes(
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
      pathname: API_CTE_EMISSION_PROFILES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Omit<CreateCteEmissionProfileInput, 'context'>>({
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
      pathname: API_CTE_EMISSION_PROFILES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Omit<UpdateCteEmissionProfileInput, 'context'>>({
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

function serializeProfile(profile: CteEmissionProfileDetail): object {
  return {
    cargoInsuranceDeclared: profile.cargoInsuranceDeclared,
    cfopInternal: profile.cfopInternal,
    cfopInterstate: profile.cfopInterstate,
    chargeComponentLabel: profile.chargeComponentLabel,
    components: profile.components.map((component) => ({ ...component })),
    createdAt: profile.createdAt,
    deliveryDays: profile.deliveryDays,
    freightRule: { ...profile.freightRule },
    freightRuleId: profile.freightRuleId,
    groupingMode: profile.groupingMode,
    icmsBaseReductionRate: profile.icmsBaseReductionRate,
    icmsCst: profile.icmsCst,
    icmsRate: profile.icmsRate,
    id: profile.id,
    matchers: profile.matchers.map((matcher) => ({ ...matcher })),
    matchMode: profile.matchMode,
    modal: profile.modal,
    name: profile.name,
    observations: profile.observations,
    operationNature: profile.operationNature,
    pickupDetails: profile.pickupDetails,
    pickupIndicator: profile.pickupIndicator,
    predominantProductMode: profile.predominantProductMode,
    predominantProductName: profile.predominantProductName,
    priority: profile.priority,
    receiverIeIndicator: profile.receiverIeIndicator,
    serviceType: profile.serviceType,
    status: profile.status,
    taker: profile.taker,
    updatedAt: profile.updatedAt,
    version: profile.version,
  }
}
