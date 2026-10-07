/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): a entrada da prévia por e-mail encaminhado, no perfil do contratante. Tudo é
 * `settings.manage`, ler e escrever (o separador lê a frota e não alcança nada daqui; precedente: o calendário
 * de dias úteis, spec 238). O token só sai no `POST`, uma vez, e a resposta nunca vai para cache.
 */
import { defineRoute } from '../../http/router.service.js'
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import {
  parseOptionalBody,
  parseBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import {
  API_CONTRACTOR_EMAIL_INTAKES_PATH,
  API_CONTRACTOR_INBOUND_TOKEN_PATH,
  API_CONTRACTOR_PREVIEW_EMAIL_PATH,
} from '../../shared/api.constant.js'
import type { ContractorPreviewEmailUseCases } from '../application/contractor-preview-email.use-case.js'
import type {
  PreviewEmailLists,
  SavePreviewEmailAllowlistsParams,
} from '../application/contractor-preview-email.types.js'
import { jsonResponse } from './cargo-arrival-http.support.js'
import {
  generateInboundTokenSchema,
  parsePreviewEmailIntakeLimit,
  previewEmailAllowlistsSchema,
} from './contractor-preview-email.schema.js'

const MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

/** Cada geração invalida o endereço anterior e grava auditoria: 10 em 5 minutos por usuário. */
export const PREVIEW_INBOUND_TOKEN_RATE_LIMIT = {
  maxRequests: 10,
  scope: 'receiving-profile-inbound-token',
  store: 'postgres',
  windowSeconds: 300,
} as const

export type ContractorPreviewEmailRoutesDependencies = ContractorPreviewEmailUseCases & {
  readonly resolveClientIp: ClientIpResolver
}

type ContractorInput = { readonly contractorId: string }
type AuditedInput = ContractorInput & {
  readonly correlationId: string
  readonly ipAddress: string
}
type SaveInput = AuditedInput & PreviewEmailLists

export function createContractorPreviewEmailRoutes(
  dependencies: ContractorPreviewEmailRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    settingsRoute(dependencies),
    saveRoute(dependencies),
    tokenRoute(dependencies),
    intakesRoute(dependencies),
  ]
}

function parseContractor(pathParameters: Readonly<Record<string, string>>): ContractorInput {
  return { contractorId: parseUuidPathIdentifier(pathParameters.id ?? '') }
}

function settingsRoute(dependencies: ContractorPreviewEmailRoutesDependencies) {
  return defineRoute<ContractorInput>({
    async handle({ context, input }): Promise<Response> {
      const settings = await dependencies.getSettings.execute({ ...input, context: context.scope })
      return jsonResponse({ body: { data: settings }, status: 200 })
    },
    method: 'GET',
    parse: ({ pathParameters }) => parseContractor(pathParameters),
    pathname: API_CONTRACTOR_PREVIEW_EMAIL_PATH,
    policy: MANAGE_POLICY,
  })
}

function saveRoute(dependencies: ContractorPreviewEmailRoutesDependencies) {
  return defineRoute<SaveInput>({
    async handle({ context, input }): Promise<Response> {
      const params: SavePreviewEmailAllowlistsParams = { ...input, context: context.scope }
      const settings = await dependencies.saveAllowlists.execute(params)
      return jsonResponse({ body: { data: settings }, status: 200 })
    },
    method: 'PUT',
    parse: async ({ correlationId, pathParameters, request }) => ({
      ...parseContractor(pathParameters),
      correlationId,
      ipAddress: dependencies.resolveClientIp(request),
      ...(await parseBody(previewEmailAllowlistsSchema, request)),
    }),
    pathname: API_CONTRACTOR_PREVIEW_EMAIL_PATH,
    policy: MANAGE_POLICY,
  })
}

function tokenRoute(dependencies: ContractorPreviewEmailRoutesDependencies) {
  return defineRoute<AuditedInput>({
    async handle({ context, input }): Promise<Response> {
      const generated = await dependencies.rotateInboundToken.execute({
        ...input,
        context: context.scope,
      })
      return jsonResponse({ body: { data: generated }, status: 200 })
    },
    method: 'POST',
    parse: async ({ correlationId, pathParameters, request }) => {
      await parseOptionalBody(generateInboundTokenSchema, request)
      return {
        ...parseContractor(pathParameters),
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
      }
    },
    pathname: API_CONTRACTOR_INBOUND_TOKEN_PATH,
    policy: MANAGE_POLICY,
    rateLimit: PREVIEW_INBOUND_TOKEN_RATE_LIMIT,
  })
}

function intakesRoute(dependencies: ContractorPreviewEmailRoutesDependencies) {
  return defineRoute<ContractorInput & { readonly limit: number }>({
    async handle({ context, input }): Promise<Response> {
      const intakes = await dependencies.listIntakes.execute({ ...input, context: context.scope })
      return jsonResponse({ body: { data: intakes }, status: 200 })
    },
    method: 'GET',
    parse: ({ pathParameters, request }) => ({
      ...parseContractor(pathParameters),
      limit: parsePreviewEmailIntakeLimit(new URL(request.url)),
    }),
    pathname: API_CONTRACTOR_EMAIL_INTAKES_PATH,
    policy: MANAGE_POLICY,
  })
}
