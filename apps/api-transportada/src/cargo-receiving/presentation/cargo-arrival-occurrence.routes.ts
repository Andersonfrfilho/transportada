/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9): a avaria sem viagem e a marcação "devolver ao contratante". Ler é
 * `fleet.read`; abrir, marcar e concluir é `trip.manage` (separador e escritório); DESFAZER é
 * `occurrences.resolve` — o separador que registrou a avaria não devolve a caixa à rota sozinho
 * (ADR-0067, spec 164). A nota é o id da NF-e: ela está em uma chegada só.
 */
import { defineRoute } from '../../http/router.service.js'
import { parseUuidPathIdentifier, readListQuery } from '../../http/request-parsing.service.js'
import {
  API_CARGO_ARRIVAL_DOCUMENT_OCCURRENCES_PATH,
  API_CARGO_ARRIVAL_DOCUMENT_RETURN_COMPLETE_PATH,
  API_CARGO_ARRIVAL_DOCUMENT_RETURN_MARK_PATH,
  API_CARGO_ARRIVAL_DOCUMENT_RETURN_UNMARK_PATH,
  API_CARGO_ARRIVAL_OCCURRENCE_TYPES_PATH,
  API_CARGO_ARRIVAL_OCCURRENCES_PATH,
} from '../../shared/api.constant.js'
import type {
  CargoArrivalOccurrencesView,
  CargoArrivalReturnResult,
  ChangeCargoArrivalReturnParams,
  ReceivingOccurrenceTypeView,
  RegisterCargoArrivalOccurrenceParams,
  RegisteredCargoArrivalOccurrence,
} from '../application/cargo-arrival-occurrence.types.js'
import type { ListCargoArrivalOccurrencesParams } from '../application/read-cargo-arrival-occurrences.use-case.js'
import {
  CARGO_ARRIVAL_RETURN_ACTION,
  type CargoArrivalReturnAction,
} from '../domain/cargo-arrival-return.policy.js'
import {
  CARGO_ARRIVAL_MANAGE_POLICY,
  CARGO_ARRIVAL_READ_POLICY,
  jsonResponse,
} from './cargo-arrival-http.support.js'
import {
  parseCargoArrivalOccurrenceRequest,
  parseChangeReturnRequest,
  parseMarkReturnRequest,
  parseOccurrenceListQuery,
} from './cargo-arrival-occurrence.schema.js'

type UseCase<TParams, TResult> = { execute(params: TParams): Promise<TResult> }
type WithoutContext<TParams> = Omit<TParams, 'context'>
type PathParameters = Readonly<Record<string, string | undefined>>

export type CargoArrivalOccurrenceRoutesDependencies = {
  readonly changeReturn: UseCase<ChangeCargoArrivalReturnParams, CargoArrivalReturnResult>
  readonly listOccurrences: UseCase<ListCargoArrivalOccurrencesParams, CargoArrivalOccurrencesView>
  readonly listTypes: UseCase<
    { readonly context: ChangeCargoArrivalReturnParams['context'] },
    readonly ReceivingOccurrenceTypeView[]
  >
  readonly registerOccurrence: UseCase<
    RegisterCargoArrivalOccurrenceParams,
    RegisteredCargoArrivalOccurrence
  >
}

type Dependencies = CargoArrivalOccurrenceRoutesDependencies

/** Decidir a tratativa é deste papel; desfazer a marcação devolve a caixa à rota (ajuste 8). */
const OCCURRENCE_RESOLVE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const
const NO_QUERY_KEYS: ReadonlySet<string> = new Set()
const REGISTER_OCCURRENCE_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'cargo-arrival-occurrence',
  store: 'postgres',
  windowSeconds: 300,
} as const

/** Marcar, desfazer e concluir são transições do escritório, como a tratativa (`occurrence-case.routes.ts`). */
const RETURN_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'cargo-arrival-return',
  store: 'postgres',
  windowSeconds: 300,
} as const

const documentPathOf = (pathParameters: PathParameters) => ({
  arrivalId: parseUuidPathIdentifier(pathParameters.id ?? ''),
  documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
})

function registerRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<WithoutContext<RegisterCargoArrivalOccurrenceParams>>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.registerOccurrence.execute({
        context: context.scope,
        ...input,
      })
      return jsonResponse({
        body: { data: result.occurrence },
        status: result.isReplay ? 200 : 201,
      })
    },
    method: 'POST',
    parse: async ({ correlationId, pathParameters, request }) => ({
      ...(await parseCargoArrivalOccurrenceRequest(request)),
      ...documentPathOf(pathParameters),
      correlationId,
    }),
    pathname: API_CARGO_ARRIVAL_DOCUMENT_OCCURRENCES_PATH,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
    rateLimit: REGISTER_OCCURRENCE_RATE_LIMIT,
  })
}

function returnRoute(
  dependencies: Dependencies,
  target: {
    readonly action: CargoArrivalReturnAction
    readonly pathname: string
    readonly policy: typeof CARGO_ARRIVAL_MANAGE_POLICY | typeof OCCURRENCE_RESOLVE_POLICY
  },
): ReturnType<typeof defineRoute> {
  return defineRoute<WithoutContext<ChangeCargoArrivalReturnParams>>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.changeReturn.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: result }, status: 200 })
    },
    method: 'POST',
    parse: async ({ correlationId, pathParameters, request }) => {
      const body =
        target.action === CARGO_ARRIVAL_RETURN_ACTION.mark
          ? await parseMarkReturnRequest(request)
          : { ...(await parseChangeReturnRequest(request)), occurrenceId: null }
      return { ...documentPathOf(pathParameters), ...body, action: target.action, correlationId }
    },
    pathname: target.pathname,
    policy: target.policy,
    rateLimit: RETURN_RATE_LIMIT,
  })
}

function readRoutes(dependencies: Dependencies): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const types = await dependencies.listTypes.execute({ context: context.scope })
        return jsonResponse({ body: { data: types }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => {
        readListQuery(new URL(request.url), NO_QUERY_KEYS)
        return undefined
      },
      pathname: API_CARGO_ARRIVAL_OCCURRENCE_TYPES_PATH,
      policy: CARGO_ARRIVAL_READ_POLICY,
    }),
    defineRoute<WithoutContext<ListCargoArrivalOccurrencesParams>>({
      async handle({ context, input }): Promise<Response> {
        const view = await dependencies.listOccurrences.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: view }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => ({
        arrivalId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        documentId: parseOccurrenceListQuery(new URL(request.url)),
      }),
      pathname: API_CARGO_ARRIVAL_OCCURRENCES_PATH,
      policy: CARGO_ARRIVAL_READ_POLICY,
    }),
  ]
}

export function createCargoArrivalOccurrenceRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    ...readRoutes(dependencies),
    registerRoute(dependencies),
    returnRoute(dependencies, {
      action: CARGO_ARRIVAL_RETURN_ACTION.mark,
      pathname: API_CARGO_ARRIVAL_DOCUMENT_RETURN_MARK_PATH,
      policy: CARGO_ARRIVAL_MANAGE_POLICY,
    }),
    returnRoute(dependencies, {
      action: CARGO_ARRIVAL_RETURN_ACTION.unmark,
      pathname: API_CARGO_ARRIVAL_DOCUMENT_RETURN_UNMARK_PATH,
      policy: OCCURRENCE_RESOLVE_POLICY,
    }),
    returnRoute(dependencies, {
      action: CARGO_ARRIVAL_RETURN_ACTION.complete,
      pathname: API_CARGO_ARRIVAL_DOCUMENT_RETURN_COMPLETE_PATH,
      policy: CARGO_ARRIVAL_MANAGE_POLICY,
    }),
  ]
}
