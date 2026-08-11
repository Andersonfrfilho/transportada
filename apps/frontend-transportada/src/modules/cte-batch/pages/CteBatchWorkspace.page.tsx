/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs, type TabsItem } from '@/components/ui/tabs'
import {
  createCteIssuanceController,
  getCteIssuanceClient,
} from '@/modules/cte-issuance/hooks/useCteIssuanceStatus.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { CteBatchItemsPanel } from '../components/CteBatchItemsPanel.component'
import { CteBatchTable } from '../components/CteBatchTable.component'
import { CteBillingDialog } from '../components/CteBillingDialog.component'
import { CteItemTable } from '../components/CteItemTable.component'
import { RefreshCountdown } from '../components/RefreshCountdown.component'
import { useCteBatchItems } from '../hooks/useCteBatchItems.hook'
import { useCteBatchSubmission } from '../hooks/useCteBatchSubmission.hook'
import { useCteBatchTable } from '../hooks/useCteBatchTable.hook'
import { useCteBatchWorkspace } from '../hooks/useCteBatchWorkspace.hook'
import { useCteBillingDialog } from '../hooks/useCteBillingDialog.hook'
import { useCteItemTable } from '../hooks/useCteItemTable.hook'
import type { CteBatchSummary } from '../shared/cteBatchClient.service'
import { resolveCteBatchProgressInterval } from '../shared/cteBatchProgress.service'
import styles from '../styles/cteBatch.module.css'

const AUTH_SKELETON_FIELD_WIDTHS: readonly string[] = ['70%', '45%', '85%', '55%']
const BATCH_TABLE_SKELETON_ROW_COUNT = 4

export function CteBatchWorkspacePage() {
  const { t } = useTranslation('cteBatch')
  const authQuery = useAuthMeQuery()
  const [openBatchId, setOpenBatchId] = useState<undefined | string>(undefined)
  const [activeTab, setActiveTab] = useState<'batches' | 'documents'>('documents')
  const [billingBatchIds, setBillingBatchIds] = useState<null | readonly string[]>(null)

  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useCteBatchWorkspace({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const batches = workspace.batchesQuery.data?.items ?? []
  const table = useCteBatchTable({
    batches,
    ...(companyId === undefined ? {} : { companyId }),
  })
  const items = useCteBatchItems({
    ...(openBatchId === undefined ? {} : { batchId: openBatchId }),
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const itemTable = useCteItemTable({
    batches,
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const submission = useCteBatchSubmission({
    ...(companyId === undefined ? {} : { companyId }),
    onFinish: () => void workspace.batchesQuery.refetch(),
    submitBatch: (batchId) =>
      createCteIssuanceController({
        client: getCteIssuanceClient(),
        permissions,
      }).issueBatch({ batchId, idempotencyKey: crypto.randomUUID() }),
  })
  const billingDialog = useCteBillingDialog({
    batchIds: billingBatchIds,
    onClose: () => setBillingBatchIds(null),
    request: null,
  })
  const batchOptions = batches.map((batch) => ({ label: batch.name, value: batch.id }))
  const openBatch = batches.find((batch) => batch.id === openBatchId)
  const isForbidden =
    companyId === undefined || (!workspace.canManageBatches && !workspace.canSubmitBatches)

  function handleOpenItems(batch: CteBatchSummary): void {
    setOpenBatchId((current) => (current === batch.id ? undefined : batch.id))
  }

  function handleCancel(batch: CteBatchSummary): void {
    workspace.cancelBatchMutation.mutate(batch.id)
  }

  function handleBill(selected: readonly CteBatchSummary[]): void {
    setBillingBatchIds(selected.map((batch) => batch.id))
  }

  function renderBatchTableSkeleton() {
    return (
      <SkeletonGroup className={styles.panel} label={t('loading')}>
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">
                  <Skeleton
                    height="var(--icon-size-md)"
                    variant="block"
                    width="var(--icon-size-md)"
                  />
                </th>
                {table.visibleColumns.map((column) => (
                  <th key={column} scope="col">
                    {t(`columns.${column}`)}
                  </th>
                ))}
                <th scope="col">{t('items.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: BATCH_TABLE_SKELETON_ROW_COUNT }, (_, rowIndex) => (
                <tr key={rowIndex}>
                  <td>
                    <Skeleton
                      height="var(--icon-size-md)"
                      variant="block"
                      width="var(--icon-size-md)"
                    />
                  </td>
                  {table.visibleColumns.map((column) => (
                    <td key={column}>
                      <Skeleton variant="text" width="70%" />
                    </td>
                  ))}
                  <td>
                    <Skeleton variant="text" width="6rem" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SkeletonGroup>
    )
  }

  const tabs: readonly TabsItem[] = [
    ...(itemTable.canReadItems
      ? [
          {
            id: 'documents',
            label: t('tabs.documents'),
            panel: <CteItemTable batchOptions={batchOptions} table={itemTable} />,
          },
        ]
      : []),
    {
      badge: String(batches.length),
      id: 'batches',
      label: t('tabs.batches'),
      panel: (
        <>
          {workspace.batchesQuery.isLoading ? renderBatchTableSkeleton() : null}
          {workspace.batchesQuery.isError ? (
            <p className={styles.hint} role="alert">
              {t('error')}
            </p>
          ) : null}
          {workspace.batchesQuery.isLoading ? null : (
            <RefreshCountdown
              intervalMs={resolveCteBatchProgressInterval(workspace.batchesQuery.data)}
              updatedAt={workspace.batchesQuery.dataUpdatedAt}
            />
          )}
          {workspace.batchesQuery.isLoading ? null : (
            <CteBatchTable
              actions={{
                onBill: handleBill,
                onCancel: handleCancel,
                onOpenItems: handleOpenItems,
              }}
              {...(openBatchId === undefined ? {} : { openBatchId })}
              permissions={permissions}
              submission={submission}
              table={table}
            />
          )}
          {openBatch === undefined ? null : (
            <CteBatchItemsPanel
              batch={openBatch}
              controller={items}
              onBill={() => handleBill([openBatch])}
              permissions={permissions}
            />
          )}
          <CteBillingDialog dialog={billingDialog} />
        </>
      ),
    },
  ]
  const selectedTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'batches'

  return (
    <main className={styles.cteBatchShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>

      {authQuery.isLoading ? (
        <SkeletonGroup className={styles.panel} label={t('loading')}>
          <div className={styles.panelHead}>
            <Skeleton variant="text" width="10rem" />
            <Skeleton height="var(--field-height-compact)" width="8rem" />
          </div>
          {AUTH_SKELETON_FIELD_WIDTHS.map((width, index) => (
            <Skeleton key={index} variant="text" width={width} />
          ))}
        </SkeletonGroup>
      ) : null}
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
        <Tabs
          ariaLabel={t('title')}
          items={tabs}
          onChange={(id) => setActiveTab(id === 'documents' ? 'documents' : 'batches')}
          value={selectedTab}
        />
      ) : null}
    </main>
  )
}
