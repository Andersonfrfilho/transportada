/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createOperationsResponseAdapters } from './operationsResponse.validation'

export type OperationsSummary = Readonly<{
  generatedAt: string
  modules: readonly Readonly<{
    failed: number
    module: string
    pending: number
    processing: number
    retryScheduled: number
    succeeded: number
  }>[]
  recentErrors: readonly Readonly<{
    code: string
    correlationId: string
    message: string
    module: string
    occurredAt: string
  }>[]
}>

export type OperationsTimelineEvent = Readonly<{
  action: string
  correlationId: string
  entityId: string
  entityType: string
  metadata: Readonly<Record<string, string>>
  occurredAt: string
  result: 'allowed' | 'denied' | 'failed'
}>

export type OperationsJob = Readonly<{
  attemptCount: number
  correlationId: string
  entityId: string
  entityType: string
  id: string
  lastErrorCode: string
  lastErrorMessage: string
  module: string
  nextAttemptAt: null | string
  status:
    | 'cancelled'
    | 'dead_letter'
    | 'failed'
    | 'pending'
    | 'processing'
    | 'retry_scheduled'
    | 'succeeded'
  updatedAt: string
}>

export type AuditEvent = Readonly<{
  action: string
  actorUserId: string
  correlationId: string
  createdAt: string
  id: string
  metadata: Readonly<Record<string, string>>
  permission: string
  reason: string
  result: 'allowed' | 'denied' | 'failed'
  targetId: string
  targetType: string
}>

export type OperationsPage<TEntity> = Readonly<{
  items: readonly TEntity[]
  nextCursor: null | string
}>

export type OperationsSummaryFilters = Readonly<{
  correlationId?: string
  entityId?: string
  entityType?: string
  from?: string
  module?: string
  status?: string
  to?: string
}>

export type OperationsTimelineFilters = Readonly<{
  correlationId?: string
  entityId?: string
  entityType?: string
  module?: string
}>

export type OperationsJobFilters = Readonly<{
  correlationId?: string
  entityId?: string
  entityType?: string
  module?: string
  status?: string
}>

export type AuditEventFilters = Readonly<{
  action?: string
  actorUserId?: string
  correlationId?: string
  result?: string
  targetId?: string
  targetType?: string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type OperationsClient = Readonly<{
  getSummary: (input: OperationsSummaryFilters) => Promise<OperationsSummary>
  listAuditEvents: (
    input: Readonly<{ limit?: number } & AuditEventFilters>,
  ) => Promise<OperationsPage<AuditEvent>>
  listJobs: (
    input: Readonly<{ cursor?: null | string; limit?: number } & OperationsJobFilters>,
  ) => Promise<OperationsPage<OperationsJob>>
  listTimeline: (
    input: Readonly<{ cursor?: null | string; limit?: number } & OperationsTimelineFilters>,
  ) => Promise<OperationsPage<OperationsTimelineEvent>>
  /**
   * Spec 072. **Nunca lança**: quem apertou o botão precisa de um veredito, e um estouro no lugar de
   * um aviso o faria concluir que o botão não funciona.
   */
  runJob: (input: Readonly<{ job: string }>) => Promise<RunJobOutcome>
}>

/**
 * `already_running` é resposta de primeira classe, não erro: é o freio que a RNF1 exige, e o
 * operador precisa lê-lo como "já está rodando", não como "deu ruim".
 */
export type RunJobOutcome = 'started' | 'already_running' | 'failed'

function requestError(code: string): Error {
  return new Error(code)
}

function createSearch(input: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  return search.toString()
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError('OPERATIONS_REQUEST_FAILED')
  }
  if (!response.ok) throw requestError('OPERATIONS_REQUEST_FAILED')
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('OPERATIONS_RESPONSE_INVALID')
  }
}

async function authorizedGet(
  input: Readonly<{ dependencies: ClientDependencies; path: string }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
    }),
  })
}

export function createOperationsClient(dependencies: ClientDependencies): OperationsClient {
  const adapters = createOperationsResponseAdapters()
  return {
    async runJob(input) {
      const accessToken = await dependencies.getAccessToken()
      let response: Response
      try {
        response = await dependencies.fetch(
          new Request(
            `${dependencies.apiUrl}/operations/jobs/${encodeURIComponent(input.job)}/run`,
            {
              cache: 'no-store',
              headers: { authorization: `Bearer ${accessToken}` },
              method: 'POST',
            },
          ),
        )
      } catch {
        return 'failed'
      }

      /**
       * O `409` é lido pelo **status**, e não pelo corpo: `requestJson` colapsa toda falha num
       * código só, e ali a recusa por execução aberta ficaria indistinguível de rede caída.
       */
      if (response.status === 409) return 'already_running'

      return response.ok ? 'started' : 'failed'
    },
    async getSummary(input) {
      return adapters.summaryFromApi(
        await authorizedGet({
          dependencies,
          path: `/operations/summary?${createSearch(input)}`,
        }),
      )
    },
    async listAuditEvents(input) {
      return adapters.auditPageFromApi(
        await authorizedGet({
          dependencies,
          path: `/audit/events?${createSearch(input)}`,
        }),
      )
    },
    async listJobs(input) {
      return adapters.jobsPageFromApi(
        await authorizedGet({
          dependencies,
          path: `/operations/jobs?${createSearch(input)}`,
        }),
      )
    },
    async listTimeline(input) {
      return adapters.timelinePageFromApi(
        await authorizedGet({
          dependencies,
          path: `/operations/timeline?${createSearch(input)}`,
        }),
      )
    },
  }
}

export function createOperationsPollingState(input: {
  readonly jobs: null | Pick<OperationsPage<Pick<OperationsJob, 'status'>>, 'items'>
}): Readonly<{ enabled: boolean; intervalMs: null | number }> {
  const items = input.jobs?.items ?? []
  const enabled = items.some((item) =>
    ['pending', 'processing', 'retry_scheduled'].includes(item.status),
  )
  return {
    enabled,
    intervalMs: enabled ? 10_000 : null,
  }
}
