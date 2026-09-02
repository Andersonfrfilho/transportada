/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { SCHEDULED_JOBS } from '../../shared/job-catalog.constant.js'
import {
  API_AUDIT_EVENTS_PATH,
  API_OPERATIONS_JOB_RUN_PATH,
  API_OPERATIONS_JOBS_PATH,
  API_OPERATIONS_SUMMARY_PATH,
  API_OPERATIONS_TIMELINE_PATH,
  HTTP_ERROR,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const OPERATIONS_READ_POLICY = { permission: 'operations.read', scope: 'company' } as const
/** Spec 072: disparar é **ação**, e ela gasta cota de terceiro — não sai de carona com ler. */
const OPERATIONS_RUN_POLICY = { permission: 'operations.run', scope: 'company' } as const
const AUDIT_READ_POLICY = { permission: 'audit.read', scope: 'company' } as const
const MAX_PAGE_LIMIT = 100
const SENSITIVE_KEY_PATTERN =
  /(?:xml|payload|content|storagekey|storage_key|certificate|password|privatekey|private_key|token)/i

type WithContext<TInput> = TInput & {
  readonly context: CompanyContext
}

type SummaryInput = {
  readonly filters: Record<string, unknown>
}

type PageInput = SummaryInput & {
  readonly cursor: string | null
  readonly limit: number
}

type Dependencies = {
  readonly audit: {
    readonly listEvents: (input: WithContext<PageInput>) => Promise<Record<string, unknown>>
  }
  readonly runJob: {
    readonly run: (input: {
      readonly context: CompanyContext
      readonly correlationId: string
      readonly job: never
    }) => Promise<
      | { readonly executionId: string; readonly outcome: 'started' }
      | { readonly outcome: 'already_running' }
    >
  }
  readonly operations: {
    readonly getSummary: (input: WithContext<SummaryInput>) => Promise<Record<string, unknown>>
    readonly listJobs: (input: WithContext<PageInput>) => Promise<Record<string, unknown>>
    readonly listTimeline: (input: WithContext<PageInput>) => Promise<Record<string, unknown>>
  }
}

export function createOperationsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<SummaryInput>({
      async handle({ context, input }): Promise<Response> {
        const summary = await dependencies.operations.getSummary({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: sanitizeValue(summary) }, status: 200 })
      },
      method: 'GET',
      parse: ({ request }) => ({ filters: parseSummaryFilters(new URL(request.url)) }),
      pathname: API_OPERATIONS_SUMMARY_PATH,
      policy: OPERATIONS_READ_POLICY,
    }),
    defineRoute<PageInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.operations.listTimeline({
          context: context.scope,
          ...input,
        })
        return pageResponse(page)
      },
      method: 'GET',
      parse: ({ request }) => parseOperationsPage(new URL(request.url), 'timeline'),
      pathname: API_OPERATIONS_TIMELINE_PATH,
      policy: OPERATIONS_READ_POLICY,
    }),
    defineRoute<PageInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.operations.listJobs({
          context: context.scope,
          ...input,
        })
        return pageResponse(page)
      },
      method: 'GET',
      parse: ({ request }) => parseOperationsPage(new URL(request.url), 'jobs'),
      pathname: API_OPERATIONS_JOBS_PATH,
      policy: OPERATIONS_READ_POLICY,
    }),
    defineRoute<PageInput>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.audit.listEvents({
          context: context.scope,
          ...input,
        })
        return pageResponse(page)
      },
      method: 'GET',
      parse: ({ request }) => parseAuditPage(new URL(request.url)),
      pathname: API_AUDIT_EVENTS_PATH,
      policy: AUDIT_READ_POLICY,
    }),
    defineRoute<{ readonly correlationId: string; readonly job: string }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.runJob.run({
          context: context.scope,
          correlationId: input.correlationId,
          job: input.job as never,
        })

        /**
         * `409` decidido pelo **índice**, não por leitura prévia: `startManual` devolve `null`
         * quando o `on conflict do nothing` não inseriu. É o mesmo freio que a RNF1 exige — sem ele
         * o botão vira um jeito de martelar a BrasilAPI por clique.
         */
        if (result.outcome === 'already_running') {
          return jsonResponse({
            body: {
              error: {
                code: 'JOB_ALREADY_RUNNING',
                message: 'This routine already has an open execution',
              },
            },
            status: 409,
          })
        }

        /** `202`: aceita para processamento. Quem roda é o worker, e a tela acompanha pela lista. */
        return jsonResponse({ body: { data: result }, status: 202 })
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        job: parseScheduledJob(pathParameters.job ?? ''),
      }),
      pathname: API_OPERATIONS_JOB_RUN_PATH,
      /**
       * O nome da rotina carrega `.` (`geocoding.backfill`), e o formato padrão de parâmetro do
       * roteador recusaria o caminho com `404` **antes** de qualquer validação nossa — mesmo caso da
       * chave de endereço em `/geocoded-addresses/:addressKey`.
       */
      pathParameterFormat: 'raw',
      policy: OPERATIONS_RUN_POLICY,
    }),
  ]
}

/**
 * Rotina fora do catálogo é `400`, não `500`: o nome vem do caminho, e caminho é entrada de usuário.
 * O `.` do nome (`geocoding.backfill`) não é separador para o roteador, mas a validação aqui evita
 * procurar no banco por lixo.
 */
function parseScheduledJob(value: string): string {
  const job = decodeURIComponent(value).trim()
  if (!SCHEDULED_JOBS.some((candidate) => candidate === job)) {
    throw new ApiError({
      code: 'UNKNOWN_SCHEDULED_JOB',
      message: 'Unknown scheduled job',
      status: 400,
    })
  }

  return job
}

function parseSummaryFilters(url: URL): Record<string, unknown> {
  assertAllowedQueryKeys(url, [
    'correlationId',
    'entityId',
    'entityType',
    'from',
    'module',
    'status',
    'to',
  ])
  return pickFilters(url, [
    'correlationId',
    'entityId',
    'entityType',
    'from',
    'module',
    'status',
    'to',
  ])
}

function parseOperationsPage(url: URL, kind: 'jobs' | 'timeline'): PageInput {
  const filterKeys =
    kind === 'jobs'
      ? ['correlationId', 'entityId', 'entityType', 'module', 'status']
      : ['correlationId', 'entityId', 'entityType', 'module']
  assertAllowedQueryKeys(url, ['cursor', 'limit', ...filterKeys])
  return {
    cursor: optionalQuery(url, 'cursor'),
    filters: pickFilters(url, filterKeys),
    limit: parseLimit(optionalQuery(url, 'limit')),
  }
}

function parseAuditPage(url: URL): PageInput {
  const filterKeys = ['action', 'actorUserId', 'correlationId', 'result', 'targetId', 'targetType']
  assertAllowedQueryKeys(url, ['cursor', 'limit', ...filterKeys])
  return {
    cursor: optionalQuery(url, 'cursor'),
    filters: pickFilters(url, filterKeys),
    limit: parseLimit(optionalQuery(url, 'limit')),
  }
}

function assertAllowedQueryKeys(url: URL, allowedKeys: readonly string[]): void {
  const allowed = new Set(allowedKeys)
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}

function pickFilters(url: URL, keys: readonly string[]): Record<string, unknown> {
  const filters: Record<string, unknown> = {}
  for (const key of keys) {
    const value = optionalQuery(url, key)
    if (value !== null) filters[key] = value
  }
  return filters
}

function optionalQuery(url: URL, key: string): string | null {
  const value = url.searchParams.get(key)
  if (value === null || value.trim().length === 0) return null
  return value
}

function parseLimit(value: string | null): number {
  if (value === null) return 25
  if (!/^[1-9][0-9]{0,2}$/.test(value)) throw new ApiError(HTTP_ERROR.invalidRequest)
  return Math.min(Number(value), MAX_PAGE_LIMIT)
}

function pageResponse(page: Record<string, unknown>): Response {
  return jsonResponse({
    body: {
      data: readItems(page).map((item) => sanitizeValue(item)),
      page: { nextCursor: readNextCursor(page) },
    },
    status: 200,
  })
}

function readItems(page: Record<string, unknown>): readonly Record<string, unknown>[] {
  const items = page['items']
  if (!Array.isArray(items)) return []
  return items.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  )
}

function readNextCursor(page: Record<string, unknown>): string | null {
  const nextCursor = page['nextCursor']
  return typeof nextCursor === 'string' ? nextCursor : null
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item))
  if (value === null || typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    output[key] = sanitizeValue(item)
  }
  return output
}
