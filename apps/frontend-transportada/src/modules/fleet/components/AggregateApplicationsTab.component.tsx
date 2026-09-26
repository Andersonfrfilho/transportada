/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { AggregateApplicationAttachments } from './AggregateApplicationAttachments.component'
import { AggregateRejectionDialog } from './AggregateRejectionDialog.component'

import { FleetTableSkeleton } from './FleetTableSkeleton.component'
import type { AggregateApplication } from '../shared/aggregateApplicationClient.service'
import {
  formatDeclaredAddress,
  parseDeclaredData,
} from '../shared/aggregateApplicationDeclaredData.service'
import styles from '../styles/fleet.module.css'

const APPLICATIONS_COLUMN_COUNT = 5

type SortColumn = 'name' | 'status'
type SortState = Readonly<{ column: SortColumn; direction: 'asc' | 'desc' }> | null
const SORT_INDICATOR = { ascending: '▲', descending: '▼', none: '' } as const

/** Terceiro clique no cabeçalho volta à ordem natural — sem ele não há como desfazer a ordenação. */
function nextSort(current: SortState, column: SortColumn): SortState {
  if (current === null || current.column !== column) return { column, direction: 'asc' }
  if (current.direction === 'asc') return { column, direction: 'desc' }
  return null
}

function sortApplications(
  applications: readonly AggregateApplication[],
  sort: SortState,
): readonly AggregateApplication[] {
  if (sort === null) return applications
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...applications].sort(
    (left, right) => left[sort.column].localeCompare(right[sort.column]) * direction,
  )
}

type RejectDialogState = Readonly<{ applicationId: string }> | null

function statusLabel(status: AggregateApplication['status'], t: (key: string) => string): string {
  return t(`applications.status.${status}`)
}

type AggregateApplicationsTabProps = Readonly<{
  applications: readonly AggregateApplication[]
  isApproving: boolean
  isRejecting: boolean
  loading: boolean
  onApprove: (id: string) => void
  onReject: (input: Readonly<{ id: string; rejectionReason: string }>) => void
  onViewDriver: (name: string) => void
}>

export function AggregateApplicationsTab({
  applications,
  isApproving,
  isRejecting,
  loading,
  onApprove,
  onReject,
  onViewDriver,
}: AggregateApplicationsTabProps): ReactNode {
  const { t } = useTranslation('fleet')
  const [rejectDialog, setRejectDialog] = useState<RejectDialogState>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [sort, setSort] = useState<SortState>(null)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set())

  if (loading) {
    return (
      <FleetTableSkeleton
        columnCount={APPLICATIONS_COLUMN_COUNT}
        label={t('applications.loading')}
      />
    )
  }
  if (applications.length === 0) return <p className={styles.kicker}>{t('applications.empty')}</p>

  const filtered = applications.filter((application) =>
    application.name.toLowerCase().includes(nameFilter.trim().toLowerCase()),
  )
  const visible = sortApplications(filtered, sort)

  function sortState(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (sort === null || sort.column !== column) return 'none'
    return sort.direction === 'asc' ? 'ascending' : 'descending'
  }

  function sortLabel(column: SortColumn): string {
    if (sort === null || sort.column !== column) return t('sort.none')
    return sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  function renderSortableHeader(column: SortColumn, label: string) {
    return (
      <th aria-sort={sortState(column)} key={column} scope="col">
        <button
          className={styles.sortButton}
          type="button"
          onClick={() => setSort((current) => nextSort(current, column))}
        >
          {label}
          <span aria-hidden="true" className={styles.sortIndicator}>
            {SORT_INDICATOR[sortState(column)]}
          </span>
          <span className={styles.srOnly}>{sortLabel(column)}</span>
        </button>
      </th>
    )
  }

  function toggleExpanded(applicationId: string): void {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(applicationId)) next.delete(applicationId)
      else next.add(applicationId)
      return next
    })
  }

  return (
    <div className={styles.tableScroll}>
      <div className={styles.filterBar}>
        <label>
          <span>{t('applications.filterName')}</span>
          <input
            type="search"
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
          />
        </label>
      </div>
      <p className={styles.hint}>
        {t('applications.shownOfTotal', { shown: visible.length, total: applications.length })}
      </p>
      <table className={styles.fleetTable}>
        <thead>
          <tr>
            {renderSortableHeader('name', t('applications.columns.name'))}
            <th scope="col">{t('applications.columns.taxId')}</th>
            <th scope="col">{t('applications.columns.contact')}</th>
            {renderSortableHeader('status', t('applications.columns.status'))}
            <th scope="col">{t('applications.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((application) => {
            const declared = parseDeclaredData(application.declaredData)
            const isExpanded = expandedIds.has(application.id)
            return (
              <Fragment key={application.id}>
                <tr>
                  <td>
                    <span className={styles.applicationNameCell}>
                      <span>{application.name}</span>
                      {application.duplicateDriverId === null ? null : (
                        <Badge variant="warning">{t('applications.duplicateBadge')}</Badge>
                      )}
                      {application.resubmittedAt === null ? null : (
                        <Badge variant="info">{t('applications.resubmittedBadge')}</Badge>
                      )}
                    </span>
                  </td>
                  <td>{application.taxId}</td>
                  <td>
                    {application.email}
                    <br />
                    {application.phone}
                  </td>
                  <td>{statusLabel(application.status, t)}</td>
                  <td className={styles.rowActions}>
                    {application.status === 'pending' ? (
                      <>
                        {application.duplicateDriverId === null ? (
                          <Button
                            disabled={isApproving}
                            size="sm"
                            type="button"
                            onClick={() => onApprove(application.id)}
                          >
                            <Icon name="check" />
                            {t('applications.approveButton')}
                          </Button>
                        ) : (
                          <Button
                            disabled={isApproving}
                            size="sm"
                            type="button"
                            onClick={() => onApprove(application.id)}
                          >
                            <Icon name="link" />
                            {t('applications.linkButton')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setRejectDialog({ applicationId: application.id })}
                        >
                          <Icon name="close" />
                          {t('applications.rejectButton')}
                        </Button>
                      </>
                    ) : null}
                    {application.duplicateDriverId === null ? null : (
                      <Button
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => onViewDriver(application.name)}
                      >
                        <Icon name="eye" />
                        {t('applications.viewDriverButton')}
                      </Button>
                    )}
                  </td>
                </tr>
                <tr>
                  <td
                    className={styles.applicationDeclaredDataCell}
                    colSpan={APPLICATIONS_COLUMN_COUNT}
                  >
                    <AggregateApplicationAttachments application={application} />
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => toggleExpanded(application.id)}
                    >
                      <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} />
                      {t(
                        isExpanded
                          ? 'applications.declaredData.toggleHide'
                          : 'applications.declaredData.toggleShow',
                      )}
                    </Button>
                    {isExpanded ? (
                      declared.driver === null && declared.vehicle === null ? (
                        <p>{t('applications.declaredData.empty')}</p>
                      ) : (
                        <>
                          {declared.driver === null ? null : (
                            <dl>
                              <dt>{t('applications.declaredData.driverTitle')}</dt>
                              {declared.driver.licenseNumber === '' ? null : (
                                <dd>
                                  {t('applications.declaredData.fields.licenseNumber')}:{' '}
                                  {declared.driver.licenseNumber}
                                </dd>
                              )}
                              {declared.driver.licenseCategory === '' ? null : (
                                <dd>
                                  {t('applications.declaredData.fields.licenseCategory')}:{' '}
                                  {declared.driver.licenseCategory}
                                </dd>
                              )}
                              {declared.driver.rntrc === '' ? null : (
                                <dd>
                                  {t('applications.declaredData.fields.rntrc')}:{' '}
                                  {declared.driver.rntrc}
                                </dd>
                              )}
                              {declared.driver.anttCategory === '' ? null : (
                                <dd>
                                  {t('applications.declaredData.fields.anttCategory')}:{' '}
                                  {declared.driver.anttCategory}
                                </dd>
                              )}
                              {declared.driver.address === null ? null : (
                                <dd>
                                  {t('applications.declaredData.fields.address')}:{' '}
                                  {formatDeclaredAddress(declared.driver.address)}
                                </dd>
                              )}
                            </dl>
                          )}
                          <dl>
                            <dt>{t('applications.declaredData.vehicleTitle')}</dt>
                            {declared.vehicle === null ? (
                              <dd>{t('applications.declaredData.noVehicle')}</dd>
                            ) : (
                              <>
                                <dd>
                                  {t('applications.declaredData.fields.plate')}:{' '}
                                  {declared.vehicle.plate}
                                </dd>
                                {declared.vehicle.brand === '' &&
                                declared.vehicle.model === '' ? null : (
                                  <dd>
                                    {t('applications.declaredData.fields.brand')}:{' '}
                                    {declared.vehicle.brand} {declared.vehicle.model}
                                  </dd>
                                )}
                                {declared.vehicle.modelYear === null ? null : (
                                  <dd>
                                    {t('applications.declaredData.fields.modelYear')}:{' '}
                                    {declared.vehicle.modelYear}
                                  </dd>
                                )}
                                {declared.vehicle.vehicleType === '' ? null : (
                                  <dd>
                                    {t('applications.declaredData.fields.vehicleType')}:{' '}
                                    {declared.vehicle.vehicleType}
                                  </dd>
                                )}
                              </>
                            )}
                          </dl>
                        </>
                      )
                    ) : null}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {rejectDialog === null ? null : (
        <AggregateRejectionDialog
          cancelLabel={t('applications.cancelButton')}
          confirmLabel={t('applications.confirmRejectButton')}
          isSubmitting={isRejecting}
          reasonLabel={t('applications.rejectionReasonLabel')}
          title={t('applications.rejectDialogTitle')}
          onCancel={() => setRejectDialog(null)}
          onConfirm={(reason) => {
            onReject({ id: rejectDialog.applicationId, rejectionReason: reason })
            setRejectDialog(null)
          }}
        />
      )}
    </div>
  )
}
