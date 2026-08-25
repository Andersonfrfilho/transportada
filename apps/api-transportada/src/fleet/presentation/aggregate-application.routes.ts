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
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { AggregateApplication } from '../application/aggregate-applications.port.js'
import type {
  AggregateApplicationsUseCase,
  SubmitAggregateApplicationInput,
} from '../application/aggregate-applications.use-case.js'
import {
  parseAggregateApplicationId,
  parseRejectAggregateApplicationRequest,
  parseSubmitAggregateApplicationRequest,
} from './aggregate-application.schema.js'

const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const ACCEPTED_STATUS = 202
const APPLICATION_ID_PATH = `${API_AGGREGATE_APPLICATIONS_PATH}/:id`
const APPROVE_PATH = `${APPLICATION_ID_PATH}/approve`
const REJECT_PATH = `${APPLICATION_ID_PATH}/reject`

type Dependencies = {
  readonly aggregateApplications: AggregateApplicationsUseCase
}

export function createAggregateApplicationPublicRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<SubmitAggregateApplicationInput>({
      /**
       * `202` invariável: documento novo, reenvio ou documento já motorista respondem igual — não
       * existe rota pública de "este documento já existe", que seria a sonda que o `202` fecha.
       */
      async handle({ input }): Promise<Response> {
        await dependencies.aggregateApplications.submit(input)
        return new Response(null, { status: ACCEPTED_STATUS })
      },
      method: 'POST',
      parse: ({ request }) => parseSubmitAggregateApplicationRequest(request),
      pathname: API_PUBLIC_AGGREGATE_APPLICATIONS_PATH,
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
