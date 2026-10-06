/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.3 (ADR-0094 §5): ler o perfil é `fleet.read`, como ler o próprio contratante; gravar
 * é `settings.manage`, porque o perfil decide prazo e janela cobrados de outra empresa.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import {
  API_CONTRACTOR_RECEIVING_PROFILE_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  ContractorReceivingProfile,
  ContractorReceivingProfileRules,
  GetContractorReceivingProfileParams,
  SaveContractorReceivingProfileParams,
} from '../application/contractor-receiving-profile.types.js'
import { contractorReceivingProfileSchema } from './contractor-receiving-profile.schema.js'

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

export type ContractorReceivingProfileRoutesDependencies = {
  readonly getProfile: {
    execute(params: GetContractorReceivingProfileParams): Promise<ContractorReceivingProfile | null>
  }
  readonly saveProfile: {
    execute(params: SaveContractorReceivingProfileParams): Promise<ContractorReceivingProfile>
  }
}

type SaveInput = {
  readonly contractorId: string
  readonly correlationId: string
  readonly rules: ContractorReceivingProfileRules
}

export function createContractorReceivingProfileRoutes(
  dependencies: ContractorReceivingProfileRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly contractorId: string }>({
      async handle({ context, input }): Promise<Response> {
        const profile = await dependencies.getProfile.execute({
          context: context.scope,
          contractorId: input.contractorId,
        })
        return jsonResponse({ data: profile })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: API_CONTRACTOR_RECEIVING_PROFILE_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }): Promise<Response> {
        const profile = await dependencies.saveProfile.execute({
          context: context.scope,
          contractorId: input.contractorId,
          correlationId: input.correlationId,
          rules: input.rules,
        })
        return jsonResponse({ data: profile })
      },
      method: 'PUT',
      parse: async ({ correlationId, pathParameters, request }) => ({
        contractorId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        correlationId,
        rules: await parseBody(contractorReceivingProfileSchema, request),
      }),
      pathname: API_CONTRACTOR_RECEIVING_PROFILE_PATH,
      policy: MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}
