/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: registrar e ler a chegada. A rota exata das candidatas vence `/:id` no roteador.
 */
import { defineRoute } from '../../http/router.service.js'
import {
  invalidRequest,
  optionalFilter,
  parseOption,
  parseUuidFilter,
  parseUuidPathIdentifier,
  readListQuery,
  readPaging,
  type Paging,
} from '../../http/request-parsing.service.js'
import {
  API_CARGO_ARRIVAL_AVAILABLE_DOCUMENTS_PATH,
  API_CARGO_ARRIVAL_PATH,
  API_CARGO_ARRIVALS_PATH,
} from '../../shared/api.constant.js'
import { CARGO_ARRIVAL_STATUSES } from '../../shared/cargo-arrival.constant.js'
import type {
  GetCargoArrivalParams,
  ListAvailableArrivalDocumentsParams,
  ListCargoArrivalsFilters,
  ListCargoArrivalsParams,
  RegisterCargoArrivalParams,
} from '../application/cargo-arrival-request.types.js'
import type {
  AvailableArrivalDocument,
  CargoArrivalDetail,
  CargoArrivalSummary,
  Page,
} from '../application/cargo-arrival.types.js'
import type { RegisterCargoArrivalResult } from '../application/register-cargo-arrival.use-case.js'
import {
  CARGO_ARRIVAL_MANAGE_POLICY,
  CARGO_ARRIVAL_READ_POLICY,
  jsonResponse,
} from './cargo-arrival-http.support.js'
import {
  parseRegisterCargoArrivalRequest,
  type RegisterCargoArrivalRequest,
} from './cargo-arrival.schema.js'

const PAGING_KEYS = ['cursor', 'limit'] as const
const AVAILABLE_QUERY_KEYS = new Set<string>(['contractorId', ...PAGING_KEYS])
const LIST_QUERY_KEYS = new Set<string>(['contractorId', 'status', ...PAGING_KEYS])

type UseCase<TParams, TResult> = { execute(params: TParams): Promise<TResult> }

export type CargoArrivalRoutesDependencies = {
  readonly getArrival: UseCase<GetCargoArrivalParams, CargoArrivalDetail>
  readonly listArrivals: UseCase<ListCargoArrivalsParams, Page<CargoArrivalSummary>>
  readonly listAvailableDocuments: UseCase<
    ListAvailableArrivalDocumentsParams,
    Page<AvailableArrivalDocument>
  >
  readonly registerArrival: UseCase<RegisterCargoArrivalParams, RegisterCargoArrivalResult>
}

type AvailableInput = { readonly contractorId: string; readonly paging: Paging }
type ListInput = { readonly filters: ListCargoArrivalsFilters; readonly paging: Paging }
type RegisterInput = RegisterCargoArrivalRequest & { readonly correlationId: string }

type Dependencies = CargoArrivalRoutesDependencies

export function createCargoArrivalRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    availableDocumentsRoute(dependencies),
    listRoute(dependencies),
    detailRoute(dependencies),
    registerRoute(dependencies),
  ]
}

function availableDocumentsRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<AvailableInput>({
    async handle({ context, input }): Promise<Response> {
      const page = await dependencies.listAvailableDocuments.execute({
        context: context.scope,
        ...input,
      })
      return jsonResponse({ body: { data: page.items, nextCursor: page.nextCursor }, status: 200 })
    },
    method: 'GET',
    parse: ({ request }) => parseAvailableQuery(new URL(request.url)),
    pathname: API_CARGO_ARRIVAL_AVAILABLE_DOCUMENTS_PATH,
    policy: CARGO_ARRIVAL_READ_POLICY,
  })
}

function listRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<ListInput>({
    async handle({ context, input }): Promise<Response> {
      const page = await dependencies.listArrivals.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: page.items, nextCursor: page.nextCursor }, status: 200 })
    },
    method: 'GET',
    parse: ({ request }) => parseListQuery(new URL(request.url)),
    pathname: API_CARGO_ARRIVALS_PATH,
    policy: CARGO_ARRIVAL_READ_POLICY,
  })
}

function detailRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<{ readonly arrivalId: string }>({
    async handle({ context, input }): Promise<Response> {
      const arrival = await dependencies.getArrival.execute({ context: context.scope, ...input })
      return jsonResponse({ body: { data: arrival }, status: 200 })
    },
    method: 'GET',
    parse: ({ pathParameters }) => ({
      arrivalId: parseUuidPathIdentifier(pathParameters.id ?? ''),
    }),
    pathname: API_CARGO_ARRIVAL_PATH,
    policy: CARGO_ARRIVAL_READ_POLICY,
  })
}

/** A repetição com a mesma chave devolve a mesma chegada com 200, nunca 201. */
function registerRoute(dependencies: Dependencies): ReturnType<typeof defineRoute> {
  return defineRoute<RegisterInput>({
    async handle({ context, input }): Promise<Response> {
      const result = await dependencies.registerArrival.execute({
        context: context.scope,
        ...input,
      })
      return jsonResponse({ body: { data: result.arrival }, status: result.isReplay ? 200 : 201 })
    },
    method: 'POST',
    parse: async ({ correlationId, request }) => ({
      correlationId,
      ...(await parseRegisterCargoArrivalRequest(request)),
    }),
    pathname: API_CARGO_ARRIVALS_PATH,
    policy: CARGO_ARRIVAL_MANAGE_POLICY,
  })
}

function parseAvailableQuery(url: URL): AvailableInput {
  const query = readListQuery(url, AVAILABLE_QUERY_KEYS)
  const contractorId = parseUuidFilter(query.get('contractorId'))
  if (contractorId === undefined) {
    throw invalidRequest([{ field: 'contractorId', message: 'The contractor is required' }])
  }
  return { contractorId, paging: readPaging(query) }
}

function parseListQuery(url: URL): ListInput {
  const query = readListQuery(url, LIST_QUERY_KEYS)
  return {
    filters: {
      ...optionalFilter('contractorId', parseUuidFilter(query.get('contractorId'))),
      ...optionalFilter('status', parseOption(query.get('status'), CARGO_ARRIVAL_STATUSES)),
    },
    paging: readPaging(query),
  }
}
