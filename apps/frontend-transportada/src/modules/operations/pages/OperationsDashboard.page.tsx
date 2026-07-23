/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useOperationsDashboard } from '../hooks/useOperationsDashboard.hook'
import type {
  AuditEvent,
  OperationsJob,
  OperationsTimelineEvent,
} from '../shared/operationsClient.service'
import { createOperationsViewModel } from '../shared/operationsViewModel.service'
import styles from '../styles/operationsWorkspace.module.css'

export function OperationsDashboardPage() {
  const { t } = useTranslation('operationsWorkspace')
  const authQuery = useAuthMeQuery()
  const [moduleFilter, setModuleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [correlationId, setCorrelationId] = useState('')
  const [entityType, setEntityType] = useState('')
  const [entityId, setEntityId] = useState('')
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id

  const workspace = useOperationsDashboard({
    auditFilters: {
      ...(correlationId === '' ? {} : { correlationId }),
      ...(entityId === '' ? {} : { targetId: entityId }),
      ...(entityType === '' ? {} : { targetType: entityType }),
    },
    ...(companyId === undefined ? {} : { companyId }),
    jobFilters: {
      ...(correlationId === '' ? {} : { correlationId }),
      ...(moduleFilter === '' ? {} : { module: moduleFilter }),
      ...(statusFilter === '' ? {} : { status: statusFilter }),
    },
    permissions,
    summaryFilters: {
      ...(correlationId === '' ? {} : { correlationId }),
      ...(moduleFilter === '' ? {} : { module: moduleFilter }),
      ...(statusFilter === '' ? {} : { status: statusFilter }),
    },
    timelineFilters: {
      ...(correlationId === '' ? {} : { correlationId }),
      ...(entityId === '' ? {} : { entityId }),
      ...(entityType === '' ? {} : { entityType }),
      ...(moduleFilter === '' ? {} : { module: moduleFilter }),
    },
  })

  const status =
    authQuery.isError ||
    workspace.summaryQuery.isError ||
    workspace.timelineQuery.isError ||
    workspace.jobsQuery.isError ||
    workspace.auditQuery.isError
      ? 'error'
      : authQuery.isLoading ||
          (workspace.controller.canReadOperations &&
            (workspace.summaryQuery.isLoading ||
              workspace.timelineQuery.isLoading ||
              workspace.jobsQuery.isLoading ||
              (workspace.controller.canReadAudit && workspace.auditQuery.isLoading)))
        ? 'loading'
        : 'success'

  const viewModel = createOperationsViewModel({
    ...(workspace.auditQuery.data === undefined ? {} : { audit: workspace.auditQuery.data }),
    ...(workspace.jobsQuery.data === undefined ? {} : { jobs: workspace.jobsQuery.data }),
    permissions,
    status,
    ...(workspace.summaryQuery.data === undefined ? {} : { summary: workspace.summaryQuery.data }),
    ...(workspace.timelineQuery.data === undefined
      ? {}
      : { timeline: workspace.timelineQuery.data }),
  })
  const summaryModules = workspace.summaryQuery.data?.modules ?? []
  const jobs: readonly OperationsJob[] = workspace.jobsQuery.data?.items ?? []
  const timelineEvents: readonly OperationsTimelineEvent[] =
    workspace.timelineQuery.data?.items ?? []
  const auditEvents: readonly AuditEvent[] = workspace.auditQuery.data?.items ?? []

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p className={styles.intro}>{t('intro')}</p>
        </div>
        <div className={styles.statusPanel}>
          <span className={styles.statusLabel}>{t('status.label')}</span>
          <strong>{t(`status.${viewModel.status}`)}</strong>
          <small>{t('status.detail', { retries: viewModel.retryJobCount ?? 0 })}</small>
        </div>
      </header>

      {viewModel.status === 'forbidden' ? (
        <p className={styles.boundary} role="alert">
          {t('boundary.forbidden')}
        </p>
      ) : (
        <>
          <section className={styles.filters}>
            <label>
              <span>{t('filters.module')}</span>
              <input
                onChange={(event) => setModuleFilter(event.target.value)}
                value={moduleFilter}
              />
            </label>
            <label>
              <span>{t('filters.status')}</span>
              <input
                onChange={(event) => setStatusFilter(event.target.value)}
                value={statusFilter}
              />
            </label>
            <label>
              <span>{t('filters.correlationId')}</span>
              <input
                onChange={(event) => setCorrelationId(event.target.value)}
                value={correlationId}
              />
            </label>
            <label>
              <span>{t('filters.entityType')}</span>
              <input onChange={(event) => setEntityType(event.target.value)} value={entityType} />
            </label>
            <label>
              <span>{t('filters.entityId')}</span>
              <input onChange={(event) => setEntityId(event.target.value)} value={entityId} />
            </label>
          </section>

          <section className={styles.summaryGrid}>
            {summaryModules.map((module) => (
              <article className={styles.summaryCard} key={module.module}>
                <span>{module.module}</span>
                <strong>{module.succeeded}</strong>
                <small>{t('summary.succeeded')}</small>
                <dl>
                  <div>
                    <dt>{t('summary.pending')}</dt>
                    <dd>{module.pending}</dd>
                  </div>
                  <div>
                    <dt>{t('summary.failed')}</dt>
                    <dd>{module.failed}</dd>
                  </div>
                  <div>
                    <dt>{t('summary.retry')}</dt>
                    <dd>{module.retryScheduled}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>

          <div className={styles.board}>
            <section className={styles.panel}>
              <h2>{t('jobs.title')}</h2>
              <ul className={styles.list}>
                {jobs.map((job) => (
                  <li className={styles.listItem} key={job.id}>
                    <div>
                      <strong>{job.module}</strong>
                      <p>{job.status}</p>
                    </div>
                    <div>
                      <span>{job.lastErrorCode}</span>
                      <small>{job.lastErrorMessage}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.panel}>
              <h2>{t('timeline.title')}</h2>
              <ol className={styles.timeline}>
                {timelineEvents.map((event) => (
                  <li key={`${event.entityId}-${event.occurredAt}`}>
                    <strong>{event.action}</strong>
                    <p>{event.entityType}</p>
                    <small>{event.occurredAt}</small>
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.panel}>
              <h2>{t('audit.title')}</h2>
              {workspace.controller.canReadAudit ? (
                <ul className={styles.list}>
                  {auditEvents.map((event) => (
                    <li className={styles.listItem} key={event.id}>
                      <div>
                        <strong>{event.action}</strong>
                        <p>{event.permission}</p>
                      </div>
                      <div>
                        <span>{event.result}</span>
                        <small>{event.reason}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.boundary}>{t('boundary.audit')}</p>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  )
}
