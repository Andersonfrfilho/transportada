/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: a primeira separação pela tela — conferir, separar, nomear a rota e fechar. A nota
 * é identificada pelo id da NF-e: ela está em uma chegada só.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  parseBody,
  parseOptionalBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import {
  API_CARGO_ARRIVAL_BATCH_STATUS_PATH,
  API_CARGO_ARRIVAL_CLOSE_PATH,
  API_CARGO_ARRIVAL_DOCUMENT_RECEIVE_PATH,
  API_CARGO_ARRIVAL_DOCUMENT_SEPARATE_PATH,
  API_CARGO_ARRIVAL_ROUTE_ASSIGNMENT_PATH,
} from '../../shared/api.constant.js'
import { CARGO_ARRIVAL_DOCUMENT_STATE } from '../../shared/cargo-arrival.constant.js'
import type {
  AssignCargoArrivalRouteParams,
  BatchCargoArrivalStatusParams,
  ChangeCargoArrivalDocumentStateParams,
  CloseCargoArrivalParams,
} from '../application/cargo-arrival-request.types.js'
import type { CargoArrivalDocumentOutcome } from '../application/cargo-arrival.types.js'
import type {
  CloseCargoArrivalResult,
  DocumentStateResult,
} from '../application/separate-cargo-arrival.use-case.js'
import type { CargoArrivalTransitionTarget } from '../domain/cargo-arrival-transition.policy.js'
import { CARGO_ARRIVAL_MANAGE_POLICY, jsonResponse } from './cargo-arrival-http.support.js'
import {
  batchCargoArrivalStatusSchema,
  cargoArrivalRouteAssignmentSchema,
  emptyBodySchema,
} from './cargo-arrival.schema.js'

type UseCase<TParams, TResult> = { execute(params: TParams): Promise<TResult> }
type Outcomes = { readonly results: readonly CargoArrivalDocumentOutcome[] }

export type CargoArrivalSeparationRoutesDependencies = {
  readonly assignRoute: UseCase<AssignCargoArrivalRouteParams, Outcomes>
  readonly batchStatus: UseCase<BatchCargoArrivalStatusParams, Outcomes>
  readonly changeDocumentState: UseCase<ChangeCargoArrivalDocumentStateParams, DocumentStateResult>
  readonly closeArrival: UseCase<CloseCargoArrivalParams, CloseCargoArrivalResult>
}

type Dependencies = CargoArrivalSeparationRoutesDependencies
type DocumentInput = { readonly arrivalId: string; readonly documentId: string }
type PathParameters = Readonly<Record<string, string | undefined>>

const arrivalIdOf = (pathParameters: PathParameters): string =>
  parseUuidPathIdentifier(pathParameters.id ?? '')

function documentStateRoute(
  dependencies: Dependencies,
  target: { readonly pathname: string; readonly to: CargoArrivalTransitionTarget },
): ReturnType<typeof defineRoute> {
  return defineRoute<DocumentInput>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.changeDocumentState.execute({
        context: context.scope,
        ...input,
        to: target.to,
      })
      return jsonResponse({ body: { data: result }, status: 200 })
    },
    method: 'POST',
    parse: async ({ pathParameters, request }) => {
      await parseOptionalBody(emptyBodySchema, request)
      return {
        arrivalId: arrivalIdOf(pathParameters),
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
      }
    },
    pathname: target.pathname,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
  })
}

export function createCargoArrivalSeparationRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    documentStateRoute(dependencies, {
      pathname: API_CARGO_ARRIVAL_DOCUMENT_RECEIVE_PATH,
      to: CARGO_ARRIVAL_DOCUMENT_STATE.received,
    }),
    documentStateRoute(dependencies, {
      pathname: API_CARGO_ARRIVAL_DOCUMENT_SEPARATE_PATH,
      to: CARGO_ARRIVAL_DOCUMENT_STATE.separated,
    }),
    batchStatusRoute(dependencies),
    routeAssignmentRoute(dependencies),
    closeRoute(dependencies),
  ]
}

function batchStatusRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<Omit<BatchCargoArrivalStatusParams, 'context'>>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.batchStatus.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: result }, status: 200 })
    },
    method: 'POST',
    parse: async ({ pathParameters, request }) => ({
      arrivalId: arrivalIdOf(pathParameters),
      ...(await parseBody(batchCargoArrivalStatusSchema, request)),
    }),
    pathname: API_CARGO_ARRIVAL_BATCH_STATUS_PATH,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
  })
}

function routeAssignmentRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<Omit<AssignCargoArrivalRouteParams, 'context'>>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.assignRoute.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: result }, status: 200 })
    },
    method: 'POST',
    parse: async ({ pathParameters, request }) => ({
      arrivalId: arrivalIdOf(pathParameters),
      ...(await parseBody(cargoArrivalRouteAssignmentSchema, request)),
    }),
    pathname: API_CARGO_ARRIVAL_ROUTE_ASSIGNMENT_PATH,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
  })
}

function closeRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<Omit<CloseCargoArrivalParams, 'context'>>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.closeArrival.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: result }, status: 200 })
    },
    method: 'POST',
    parse: async ({ correlationId, pathParameters, request }) => {
      await parseOptionalBody(emptyBodySchema, request)
      return { arrivalId: arrivalIdOf(pathParameters), correlationId }
    },
    pathname: API_CARGO_ARRIVAL_CLOSE_PATH,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
  })
}
