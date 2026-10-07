/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: as rotas da chegada montadas com casos de uso e repositórios de verdade, para a
 * integração chamar por HTTP contra o banco descartável.
 */
import {
  createGetCargoArrivalUseCase,
  createListAvailableArrivalDocumentsUseCase,
  createListCargoArrivalsUseCase,
} from '../../src/cargo-receiving/application/read-cargo-arrival.use-case.js'
import { createRegisterCargoArrivalUseCase } from '../../src/cargo-receiving/application/register-cargo-arrival.use-case.js'
import {
  createAssignCargoArrivalRouteUseCase,
  createBatchCargoArrivalStatusUseCase,
  createChangeCargoArrivalDocumentStateUseCase,
  createCloseCargoArrivalUseCase,
} from '../../src/cargo-receiving/application/separate-cargo-arrival.use-case.js'
import { DrizzleCargoArrivalReadRepository } from '../../src/cargo-receiving/infrastructure/drizzle-cargo-arrival-read.repository.js'
import { DrizzleCargoArrivalRegistrationRepository } from '../../src/cargo-receiving/infrastructure/drizzle-cargo-arrival-registration.repository.js'
import { DrizzleCargoArrivalSeparationRepository } from '../../src/cargo-receiving/infrastructure/drizzle-cargo-arrival-separation.repository.js'
import { createCargoArrivalSeparationRoutes } from '../../src/cargo-receiving/presentation/cargo-arrival-separation.routes.js'
import { createCargoArrivalRoutes } from '../../src/cargo-receiving/presentation/cargo-arrival.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { TestDatabase } from './cargo-arrival-database.fixture.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from './freight-region-http.fixture.js'

export const SEPARATOR_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'trip.manage',
])

export type CargoArrivalHandle = (request: Request) => Promise<Response>
export type CargoArrivalBody = {
  readonly data?: Record<string, unknown>
  readonly error?: Record<string, unknown>
  readonly nextCursor?: string | null
}

export type CreateCargoArrivalHandlerParams = {
  readonly context?: AuthenticatedContext<CompanyContext>
  readonly database: TestDatabase
  readonly now?: () => Date
}

export function createCargoArrivalHandler(
  params: CreateCargoArrivalHandlerParams,
): CargoArrivalHandle {
  const { database } = params
  const now = params.now ?? (() => new Date())
  const reads = new DrizzleCargoArrivalReadRepository(database.db)
  const writing = {
    channel: 'backoffice' as const,
    now,
    repository: new DrizzleCargoArrivalSeparationRepository(database.db),
  }
  const routes = [
    ...createCargoArrivalRoutes({
      getArrival: createGetCargoArrivalUseCase({ now, readRepository: reads }),
      listArrivals: createListCargoArrivalsUseCase({ now, readRepository: reads }),
      listAvailableDocuments: createListAvailableArrivalDocumentsUseCase({ readRepository: reads }),
      registerArrival: createRegisterCargoArrivalUseCase({
        channel: writing.channel,
        now,
        readRepository: reads,
        registrationRepository: new DrizzleCargoArrivalRegistrationRepository(database.db),
      }),
    }),
    ...createCargoArrivalSeparationRoutes({
      assignRoute: createAssignCargoArrivalRouteUseCase(writing),
      batchStatus: createBatchCargoArrivalStatusUseCase(writing),
      changeDocumentState: createChangeCargoArrivalDocumentStateUseCase(writing),
      closeArrival: createCloseCargoArrivalUseCase(writing),
    }),
  ]
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 30,
    router: createTestRouter({
      context: params.context ?? authenticatedContext(SEPARATOR_PERMISSIONS),
      routes,
    }),
  })
  return (request) => handleRequest(request, { timeout() {} })
}

export function buildPostRequest(input: {
  readonly body?: unknown
  readonly key?: string
  readonly path: string
}): Request {
  const request = jsonRequest({ body: input.body, method: 'POST', path: input.path })
  if (input.key === undefined) return request
  const headers = new Headers(request.headers)
  headers.set('idempotency-key', input.key)
  return new Request(request, { headers })
}

export async function callCargoArrival(
  handle: CargoArrivalHandle,
  request: Request,
): Promise<{ readonly body: CargoArrivalBody; readonly status: number }> {
  const response = await handle(request)
  return { body: (await response.json()) as CargoArrivalBody, status: response.status }
}
