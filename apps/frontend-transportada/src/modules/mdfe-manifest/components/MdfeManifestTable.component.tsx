/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import type { MdfeManifestTableController } from '../hooks/useMdfeManifestTable.hook'
import type { MdfeManifestStatus, MdfeManifestSummary } from '../shared/mdfeManifest.types'
import { resolveManifestActions } from '../shared/mdfeManifestActions.service'
import {
  formatManifestRejection,
  type MdfeManifestColumnKey,
} from '../shared/mdfeManifestTable.service'
import styles from '../styles/mdfeManifest.module.css'
import { MdfeManifestColumnsMenu } from './MdfeManifestColumnsMenu.component'

const READY_STATUSES: readonly MdfeManifestStatus[] = ['authorized', 'closed']
const ALERT_STATUSES: readonly MdfeManifestStatus[] = ['cancelled', 'rejected']

export type MdfeManifestTablePermissions = Readonly<{
  canCancel: boolean
  canClose: boolean
  canDiscard: boolean
  canIssue: boolean
}>

export type MdfeManifestTableActions = Readonly<{
  onCancel: (manifest: MdfeManifestSummary) => void
  onClose: (manifest: MdfeManifestSummary) => void
  onDiscard: (manifest: MdfeManifestSummary) => void
  onIssue: (manifest: MdfeManifestSummary) => void
}>

type MdfeManifestTableProps = Readonly<{
  actions: MdfeManifestTableActions
  permissions: MdfeManifestTablePermissions
  table: MdfeManifestTableController
}>

function statusClassName(status: MdfeManifestStatus): string {
  if (READY_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusReady}`
  if (ALERT_STATUSES.includes(status)) return `${styles.statusBadge} ${styles.statusAlert}`
  return `${styles.statusBadge}`
}

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

function describeManifest(manifest: MdfeManifestSummary): string {
  return manifest.fiscalNumber ?? manifest.id
}

export function MdfeManifestTable({ actions, permissions, table }: MdfeManifestTableProps) {
  const { t } = useTranslation('mdfeManifest')

  function canIssue(manifest: MdfeManifestSummary): boolean {
    return permissions.canIssue && resolveManifestActions(manifest.status).canIssue
  }

  function canClose(manifest: MdfeManifestSummary): boolean {
    return permissions.canClose && resolveManifestActions(manifest.status).canClose
  }

  function canCancel(manifest: MdfeManifestSummary): boolean {
    return permissions.canCancel && resolveManifestActions(manifest.status).canCancel
  }

  function canDiscard(manifest: MdfeManifestSummary): boolean {
    return permissions.canDiscard && resolveManifestActions(manifest.status).canDiscard
  }

  function renderCell(manifest: MdfeManifestSummary, column: MdfeManifestColumnKey) {
    if (column === 'status') {
      const rejection = formatManifestRejection(manifest)
      return (
        <>
          <span className={statusClassName(manifest.status)}>{t(`status.${manifest.status}`)}</span>
          {rejection === null ? null : (
            <p className={styles.rejectionReason} title={rejection}>
              <span className={styles.srOnly}>{t('rejection.label')}</span>
              {rejection}
            </p>
          )}
        </>
      )
    }
    if (column === 'createdAt') return formatMoment(manifest.createdAt)
    if (column === 'updatedAt') return formatMoment(manifest.updatedAt)
    if (column === 'cteCount') return manifest.cteCount
    if (column === 'fiscalNumber') return describeManifest(manifest)
    return manifest[column]
  }

  function sortIndicator(column: MdfeManifestColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: MdfeManifestColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('sort.none')
    return table.sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  return (
    <section className={styles.panel} aria-labelledby="mdfe-manifest-table-title">
      <div className={styles.panelHead}>
        <h2 id="mdfe-manifest-table-title">{t('manifestsTitle')}</h2>
        <p className={styles.counter}>
          {t('resultCounter', { shown: table.visibleManifests.length, total: table.totalCount })}
        </p>
      </div>

      <MdfeManifestColumnsMenu table={table} />

      {table.selectedManifests.length > 0 ? (
        <div className={styles.bulkBar}>
          <p className={styles.counter}>
            {t('selection.summary', { count: table.selectedManifests.length })}
          </p>
          <div className={styles.bulkActions}>
            <Button
              disabled={!table.selectedManifests.some(canIssue)}
              onClick={() => table.selectedManifests.filter(canIssue).forEach(actions.onIssue)}
              size="sm"
              type="button"
            >
              <Icon name="send" />
              {t('actions.issue')}
            </Button>
            <Button onClick={table.clearSelection} size="sm" type="button" variant="ghost">
              <Icon name="close" />
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
                <Checkbox
                  ariaLabel={t('selection.selectAll')}
                  checked={
                    table.visibleManifests.length > 0 &&
                    table.selectedManifests.length === table.visibleManifests.length
                  }
                  indeterminate={
                    table.selectedManifests.length > 0 &&
                    table.selectedManifests.length < table.visibleManifests.length
                  }
                  onChange={() => table.toggleAllSelection()}
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
              <th scope="col">{t('actions.title')}</th>
            </tr>
          </thead>
          <tbody>
            {table.visibleManifests.map((manifest) => (
              <tr aria-selected={table.selectedIds.includes(manifest.id)} key={manifest.id}>
                <td>
                  <Checkbox
                    ariaLabel={`${t('selection.select')} ${describeManifest(manifest)}`}
                    checked={table.selectedIds.includes(manifest.id)}
                    onChange={() => table.toggleSelection(manifest.id)}
                  />
                </td>
                {table.visibleColumns.map((column) => (
                  <td key={column}>{renderCell(manifest, column)}</td>
                ))}
                <td>
                  <div className={styles.rowActions}>
                    {canIssue(manifest) ? (
                      <Button onClick={() => actions.onIssue(manifest)} size="sm" type="button">
                        <Icon name="send" />
                        {t('actions.issue')}
                      </Button>
                    ) : null}
                    {canClose(manifest) ? (
                      <Button
                        onClick={() => actions.onClose(manifest)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Icon name="check" />
                        {t('actions.close')}
                      </Button>
                    ) : null}
                    {canCancel(manifest) ? (
                      <Button
                        onClick={() => actions.onCancel(manifest)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Icon name="alert" />
                        {t('actions.cancel')}
                      </Button>
                    ) : null}
                    {canDiscard(manifest) ? (
                      <Button
                        onClick={() => actions.onDiscard(manifest)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Icon name="trash" />
                        {t('actions.discard')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.visibleManifests.length === 0 ? <p className={styles.hint}>{t('empty')}</p> : null}
    </section>
  )
}
