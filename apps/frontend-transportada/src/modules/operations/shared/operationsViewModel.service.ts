/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AuditEvent,
  OperationsJob,
  OperationsPage,
  OperationsSummary,
  OperationsTimelineEvent,
} from './operationsClient.service'

const OPERATIONS_READ = 'operations.read'
const AUDIT_READ = 'audit.read'

export type OperationsViewModel = Readonly<{
  canReadAudit: boolean
  canReadOperations: boolean
  failedModules?: readonly string[]
  retryJobCount?: number
  status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready'
}>

type ViewModelInput = Readonly<{
  audit?: OperationsPage<AuditEvent>
  jobs?: OperationsPage<OperationsJob>
  permissions: readonly string[]
  status: 'error' | 'loading' | 'success'
  summary?: OperationsSummary
  timeline?: OperationsPage<OperationsTimelineEvent>
}>

export function createOperationsViewModel(input: ViewModelInput): OperationsViewModel {
  const canReadOperations = input.permissions.includes(OPERATIONS_READ)
  const canReadAudit = input.permissions.includes(AUDIT_READ)

  if (!canReadOperations) {
    return {
      canReadAudit: false,
      canReadOperations: false,
      status: 'forbidden',
    }
  }

  if (input.status !== 'success') {
    return {
      canReadAudit,
      canReadOperations,
      status: input.status,
    }
  }

  const modules = input.summary?.modules ?? []
  const timelineItems = input.timeline?.items ?? []
  const jobItems = input.jobs?.items ?? []
  const auditItems = input.audit?.items ?? []

  if (
    modules.length === 0 &&
    timelineItems.length === 0 &&
    jobItems.length === 0 &&
    auditItems.length === 0
  ) {
    return {
      canReadAudit,
      canReadOperations,
      status: 'empty',
    }
  }

  return {
    canReadAudit,
    canReadOperations,
    failedModules: modules.filter((module) => module.failed > 0).map((module) => module.module),
    retryJobCount: jobItems.filter((job) => job.status === 'retry_scheduled').length,
    status: 'ready',
  }
}
