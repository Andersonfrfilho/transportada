/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { CteBatchFilters } from '../components/CteBatchFilters.component'
import { CteBatchItemsPanel } from '../components/CteBatchItemsPanel.component'
import { CteBatchTable } from '../components/CteBatchTable.component'
import { useCteBatchItems } from '../hooks/useCteBatchItems.hook'
import { useCteBatchTable } from '../hooks/useCteBatchTable.hook'
import { useCteBatchWorkspace } from '../hooks/useCteBatchWorkspace.hook'
import type { CteBatchSummary } from '../shared/cteBatchClient.service'
import styles from '../styles/cteBatch.module.css'

export function CteBatchWorkspacePage() {
  const { t } = useTranslation('cteBatch')
  const authQuery = useAuthMeQuery()
  const [openBatchId, setOpenBatchId] = useState<undefined | string>(undefined)

  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useCteBatchWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const batches = workspace.batchesQuery.data?.items ?? []
  const table = useCteBatchTable({ batches })
  const items = useCteBatchItems({
    ...(openBatchId === undefined ? {} : { batchId: openBatchId }),
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const openBatch = batches.find((batch) => batch.id === openBatchId)
  const isForbidden =
    companyId === undefined || (!workspace.canManageBatches && !workspace.canSubmitBatches)

  function handleOpenItems(batch: CteBatchSummary): void {
    setOpenBatchId((current) => (current === batch.id ? undefined : batch.id))
  }

  function handleSubmit(batch: CteBatchSummary): void {
    workspace.submitBatchMutation.mutate(batch.id)
  }

  function handleCancel(batch: CteBatchSummary): void {
    workspace.cancelBatchMutation.mutate(batch.id)
  }

  return (
    <main className={styles.cteBatchShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>

      {authQuery.isLoading ? <p className={styles.hint}>{t('loading')}</p> : null}
      {authQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('error')}
        </p>
      ) : null}

      {authQuery.isSuccess && isForbidden ? (
        <p className={styles.hint} role="alert">
          {t('forbidden')}
        </p>
      ) : null}

      {authQuery.isSuccess && !isForbidden ? (
        <div className={styles.deck}>
          <CteBatchFilters table={table} />
          {workspace.batchesQuery.isLoading ? <p className={styles.hint}>{t('loading')}</p> : null}
          {workspace.batchesQuery.isError ? (
            <p className={styles.hint} role="alert">
              {t('error')}
            </p>
          ) : null}
          <CteBatchTable
            actions={{
              onCancel: handleCancel,
              onOpenItems: handleOpenItems,
              onSubmit: handleSubmit,
            }}
            {...(openBatchId === undefined ? {} : { openBatchId })}
            permissions={permissions}
            table={table}
          />
          {openBatch === undefined ? null : (
            <CteBatchItemsPanel batch={openBatch} controller={items} permissions={permissions} />
          )}
        </div>
      ) : null}
    </main>
  )
}
