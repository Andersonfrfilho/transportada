/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  defineAnonymousRoute,
  defineRoute,
  type RegisteredAnonymousRoute,
} from '../../http/router.service.js'
import {
  API_AGGREGATE_APPLICATIONS_PATH,
  API_PUBLIC_AGGREGATE_APPLICATIONS_PATH,
  HTTP_ERROR,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { verifyTurnstileToken as verifyTurnstileTokenWithCloudflare } from '../../shared/turnstile.service.js'
import type { AggregateApplication } from '../application/aggregate-applications.port.js'
import type { AggregateApplicationsUseCase } from '../application/aggregate-applications.use-case.js'
import {
  parseAggregateApplicationId,
  parseRejectAggregateApplicationRequest,
  parseSubmitAggregateApplicationRequest,
  type SubmitAggregateApplicationRequest,
} from './aggregate-application.schema.js'

const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const ACCEPTED_STATUS = 202
const APPLICATION_ID_PATH = `${API_AGGREGATE_APPLICATIONS_PATH}/:id`
const APPROVE_PATH = `${APPLICATION_ID_PATH}/approve`
const REJECT_PATH = `${APPLICATION_ID_PATH}/reject`
const ONE_MINUTE_MS = 60_000
/**
 * Formulário público de candidatura: humano preenche uma vez em minutos, não em rajada. 5 a cada
 * 10 minutos por IP segura o custo (banco, e-mail/SMS quando existir) sem incomodar quem erra o
 * CPF e tenta de novo.
 */
const SUBMIT_RATE_LIMIT = { maxRequests: 5, windowMs: 10 * ONE_MINUTE_MS } as const

type Dependencies = {
  readonly aggregateApplications: AggregateApplicationsUseCase
  /** Ausente (dev local), a rota aceita sem checar — ver `TURNSTILE_SECRET_KEY` no schema de ambiente. */
  readonly turnstileSecretKey?: string
  /** Trocável em teste — a implementação real bate na API do Cloudflare. */
  readonly verifyTurnstileToken?: typeof verifyTurnstileTokenWithCloudflare
}

export function createAggregateApplicationPublicRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  const verifyTurnstileToken = dependencies.verifyTurnstileToken ?? verifyTurnstileTokenWithCloudflare

  return [
    defineAnonymousRoute<SubmitAggregateApplicationRequest>({
      /**
       * `202` invariável: documento novo, reenvio ou documento já motorista respondem igual — não
       * existe rota pública de "este documento já existe", que seria a sonda que o `202` fecha.
       * O Turnstile é verificado antes: um `403` aqui não vaza nada sobre o documento, só diz que
       * quem mandou não passou no desafio anti-bot.
       */
      async handle({ input }): Promise<Response> {
        if (dependencies.turnstileSecretKey !== undefined) {
          const isHuman = await verifyTurnstileToken({
            secretKey: dependencies.turnstileSecretKey,
            token: input.turnstileToken,
          })
          if (!isHuman) throw new ApiError(HTTP_ERROR.forbidden)
        }

        await dependencies.aggregateApplications.submit(input)
        return new Response(null, { status: ACCEPTED_STATUS })
      },
      method: 'POST',
      parse: ({ request }) => parseSubmitAggregateApplicationRequest(request),
      pathname: API_PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      rateLimit: SUBMIT_RATE_LIMIT,
    }),
  ]
}

export function createAggregateApplicationRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const applications = await dependencies.aggregateApplications.list({ context: context.scope })
        return jsonResponse({ body: { data: applications.map(serialize) }, status: 200 })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_AGGREGATE_APPLICATIONS_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string }>({
      async handle({ context, input }): Promise<Response> {
        const application = await dependencies.aggregateApplications.approve({
          context: context.scope,
          id: input.id,
        })
        return jsonResponse({ body: { data: serialize(application) }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({ id: parseAggregateApplicationId(pathParameters) }),
      pathname: APPROVE_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
    defineRoute<{ readonly id: string; readonly rejectionReason: string }>({
      async handle({ context, input }): Promise<Response> {
        const application = await dependencies.aggregateApplications.reject({
          context: context.scope,
          id: input.id,
          rejectionReason: input.rejectionReason,
        })
        return jsonResponse({ body: { data: serialize(application) }, status: 200 })
      },
      method: 'POST',
      parse: async ({ pathParameters, request }) => ({
        id: parseAggregateApplicationId(pathParameters),
        rejectionReason: await parseRejectAggregateApplicationRequest(request),
      }),
      pathname: REJECT_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serialize(application: AggregateApplication): object {
  return {
    companyId: application.companyId,
    createdAt: application.createdAt.toISOString(),
    declaredData: application.declaredData,
    driverId: application.driverId,
    duplicateDriverId: application.duplicateDriverId,
    email: application.email,
    id: application.id,
    latestSubmission: application.latestSubmission,
    name: application.name,
    phone: application.phone,
    rejectionReason: application.rejectionReason,
    resubmittedAt: application.resubmittedAt?.toISOString() ?? null,
    reviewedAt: application.reviewedAt?.toISOString() ?? null,
    status: application.status,
    taxId: application.taxId,
    updatedAt: application.updatedAt.toISOString(),
  }
}
