/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createOperationsClient,
  createOperationsPollingState,
  type AuditEventFilters,
  type OperationsClient as Client,
  type OperationsJobFilters,
  type OperationsSummaryFilters,
  type OperationsTimelineFilters,
} from '../shared/operationsClient.service'

const OPERATIONS_READ = 'operations.read'
const AUDIT_READ = 'audit.read'
const SENSITIVE_KEY_PATTERN =
  /(?:xml|payload|content|storagekey|storage_key|certificate|password|privatekey|private_key|token|metadata)/i

const OPERATIONS_SUMMARY_QUERY_KEY = 'operations-summary'
const OPERATIONS_TIMELINE_QUERY_KEY = 'operations-timeline'
const OPERATIONS_JOBS_QUERY_KEY = 'operations-jobs'
const OPERATIONS_AUDIT_QUERY_KEY = 'operations-audit'

export type OperationsClient = Client

export type OperationsController = Readonly<{
  canReadAudit: boolean
  canReadOperations: boolean
  refresh: () => Promise<void>
}>

function forbidden(): Promise<never> {
  return Promise.reject(new Error('OPERATIONS_FORBIDDEN'))
}

export function createOperationsController(
  input: Readonly<{ client: OperationsClient; permissions: readonly string[] }>,
): OperationsController {
  const canReadOperations = input.permissions.includes(OPERATIONS_READ)
  const canReadAudit = input.permissions.includes(AUDIT_READ)

  return {
    canReadAudit,
    canReadOperations,
    refresh: () =>
      canReadOperations
        ? Promise.all([
            input.client.getSummary({}),
            input.client.listTimeline({}),
            input.client.listJobs({}),
            ...(canReadAudit ? [input.client.listAuditEvents({})] : []),
          ]).then(() => undefined)
        : forbidden(),
  }
}

export function createOperationsFilterController(): {
  readonly cleanup: () => void
  readonly filters: Readonly<Record<string, unknown>>
  readonly reset: () => void
  readonly setFilters: (input: Record<string, unknown>) => void
} {
  let currentFilters: Record<string, unknown> = {}

  function sanitizeFilters(input: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(input).flatMap(([key, value]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) return []
        if (typeof value === 'string' && SENSITIVE_KEY_PATTERN.test(value)) return []
        if (value === undefined || value === null || value === '') return []
        return [[key, value]]
      }),
    )
  }

  return {
    cleanup() {
      currentFilters = {}
    },
    get filters() {
      return Object.freeze({ ...currentFilters })
    },
    reset() {
      currentFilters = {}
    },
    setFilters(input) {
      currentFilters = sanitizeFilters(input)
    },
  }
}

function getOperationsClient(): OperationsClient {
  return createOperationsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useOperationsDashboard(
  input: Readonly<{
    auditFilters?: AuditEventFilters
    companyId?: string
    jobFilters?: OperationsJobFilters
    permissions: readonly string[]
    summaryFilters?: OperationsSummaryFilters
    timelineFilters?: OperationsTimelineFilters
  }>,
) {
  const client = getOperationsClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createOperationsController({ client, permissions })
  const jobsQuery = useQuery({
    enabled: controller.canReadOperations,
    queryFn: () => client.listJobs({ limit: 100, ...input.jobFilters }),
    queryKey: [OPERATIONS_JOBS_QUERY_KEY, input.companyId, input.jobFilters] as const,
  })
  const polling = createOperationsPollingState({
    jobs: jobsQuery.data === undefined ? null : jobsQuery.data,
  })
  const summaryQuery = useQuery({
    enabled: controller.canReadOperations,
    queryFn: () => client.getSummary(input.summaryFilters ?? {}),
    queryKey: [OPERATIONS_SUMMARY_QUERY_KEY, input.companyId, input.summaryFilters] as const,
  })
  const timelineQuery = useQuery({
    enabled: controller.canReadOperations,
    queryFn: () => client.listTimeline({ limit: 25, ...input.timelineFilters }),
    queryKey: [OPERATIONS_TIMELINE_QUERY_KEY, input.companyId, input.timelineFilters] as const,
    refetchInterval: polling.intervalMs ?? false,
  })
  const auditQuery = useQuery({
    enabled: controller.canReadAudit,
    queryFn: () => client.listAuditEvents({ limit: 50, ...input.auditFilters }),
    queryKey: [OPERATIONS_AUDIT_QUERY_KEY, input.companyId, input.auditFilters] as const,
    refetchInterval: polling.intervalMs ?? false,
  })

  return {
    auditQuery,
    controller,
    jobsQuery,
    summaryQuery,
    timelineQuery,
  }
}
