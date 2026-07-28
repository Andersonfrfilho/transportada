/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { CteBatchTableController } from '../hooks/useCteBatchTable.hook'
import type { CteBatchStatus, CteBatchSummary } from '../shared/cteBatchClient.service'
import { canCancelBatch, canSubmitBatch } from '../shared/cteBatchItemActions.service'
import type { CteBatchColumnKey } from '../shared/cteBatchTable.service'
import styles from '../styles/cteBatch.module.css'
import { CteBatchColumnsMenu } from './CteBatchColumnsMenu.component'

const READY_STATUSES: readonly CteBatchStatus[] = ['done', 'submitted']
const ALERT_STATUSES: readonly CteBatchStatus[] = ['cancelled', 'error']

export type CteBatchTableActions = Readonly<{
  onCancel: (batch: CteBatchSummary) => void
  onOpenItems: (batch: CteBatchSummary) => void
  onSubmit: (batch: CteBatchSummary) => void
}>

type CteBatchTableProps = Readonly<{
  actions: CteBatchTableActions
  openBatchId?: string
  permissions: readonly string[]
  table: CteBatchTableController
}>

function statusClassName(status: CteBatchStatus): string {
  if (READY_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusReady}`
  if (ALERT_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusAlert}`
  return `${styles.statusBadge}`
}

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

export function CteBatchTable({ actions, openBatchId, permissions, table }: CteBatchTableProps) {
  const { t } = useTranslation('cteBatch')

  function renderCell(batch: CteBatchSummary, column: CteBatchColumnKey) {
    if (column === 'status') {
      return <span className={statusClassName(batch.status)}>{t(`status.${batch.status}`)}</span>
    }
    if (column === 'createdAt') return formatMoment(batch.createdAt)
    if (column === 'updatedAt') return formatMoment(batch.updatedAt)
    if (column === 'itemCount') return batch.itemCount
    if (column === 'version') return batch.version
    return batch.name
  }

  function sortIndicator(column: CteBatchColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: CteBatchColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('sort.none')
    return table.sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  return (
    <section className={styles.panel} aria-labelledby="cte-batch-table-title">
      <div className={styles.panelHead}>
        <h2 id="cte-batch-table-title">{t('batchesTitle')}</h2>
        <p className={styles.counter}>
          {t('resultCounter', { shown: table.visibleBatches.length, total: table.totalCount })}
        </p>
      </div>

      <CteBatchColumnsMenu table={table} />

      {table.selectedBatches.length > 0 ? (
        <div className={styles.bulkBar}>
          <p className={styles.counter}>
            {t('selection.summary', { count: table.selectedBatches.length })}
          </p>
          <div className={styles.bulkActions}>
            <Button
              disabled={
                !table.selectedBatches.some((batch) => canSubmitBatch({ batch, permissions }))
              }
              onClick={() =>
                table.selectedBatches
                  .filter((batch) => canSubmitBatch({ batch, permissions }))
                  .forEach(actions.onSubmit)
              }
              size="sm"
              type="button"
            >
              {t('actions.submit')}
            </Button>
            <Button
              disabled={
                !table.selectedBatches.some((batch) => canCancelBatch({ batch, permissions }))
              }
              onClick={() =>
                table.selectedBatches
                  .filter((batch) => canCancelBatch({ batch, permissions }))
                  .forEach(actions.onCancel)
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              {t('actions.cancel')}
            </Button>
            <Button onClick={table.clearSelection} size="sm" type="button" variant="ghost">
              {t('selection.clear')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th scope="col">
                <input
                  aria-label={t('selection.selectAll')}
                  checked={
                    table.visibleBatches.length > 0 &&
                    table.selectedBatches.length === table.visibleBatches.length
                  }
                  onChange={table.toggleAllSelection}
                  type="checkbox"
                />
              </th>
              {table.visibleColumns.map((column) => (
                <th key={column} scope="col">
                  <button
                    className={styles.sortButton}
                    onClick={() => table.toggleSort(column)}
                    type="button"
                  >
                    {t(`columns.${column}`)}
                    <span className={styles.sortIndicator} aria-hidden="true">
                      {sortIndicator(column)}
                    </span>
                    <span className={styles.srOnly}>{sortLabel(column)}</span>
                  </button>
                </th>
              ))}
              <th scope="col">{t('items.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {table.visibleBatches.map((batch) => (
              <tr aria-selected={table.selectedIds.includes(batch.id)} key={batch.id}>
                <td>
                  <input
                    aria-label={`${t('selection.select')} ${batch.name}`}
                    checked={table.selectedIds.includes(batch.id)}
                    onChange={() => table.toggleSelection(batch.id)}
                    type="checkbox"
                  />
                </td>
                {table.visibleColumns.map((column) => (
                  <td key={column}>{renderCell(batch, column)}</td>
                ))}
                <td>
                  <div className={styles.rowActions}>
                    <Button
                      onClick={() => actions.onOpenItems(batch)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {openBatchId === batch.id ? t('actions.closeItems') : t('actions.openItems')}
                    </Button>
                    {canSubmitBatch({ batch, permissions }) ? (
                      <Button onClick={() => actions.onSubmit(batch)} size="sm" type="button">
                        {t('actions.submit')}
                      </Button>
                    ) : null}
                    {canCancelBatch({ batch, permissions }) ? (
                      <Button
                        onClick={() => actions.onCancel(batch)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        {t('actions.cancel')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.visibleBatches.length === 0 ? <p className={styles.hint}>{t('empty')}</p> : null}
    </section>
  )
}
