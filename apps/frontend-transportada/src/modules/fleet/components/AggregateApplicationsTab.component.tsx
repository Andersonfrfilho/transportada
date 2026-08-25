/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { FleetTableSkeleton } from './FleetTableSkeleton.component'
import type { AggregateApplication } from '../shared/aggregateApplicationClient.service'
import styles from '../styles/fleet.module.css'

const APPLICATIONS_COLUMN_COUNT = 5

type RejectDialogState = Readonly<{ applicationId: string; reason: string }> | null

type AggregateApplicationsTabProps = Readonly<{
  applications: readonly AggregateApplication[]
  isApproving: boolean
  isRejecting: boolean
  loading: boolean
  onApprove: (id: string) => void
  onReject: (input: Readonly<{ id: string; rejectionReason: string }>) => void
  onViewDriver: (name: string) => void
}>

function statusLabel(status: AggregateApplication['status'], t: (key: string) => string): string {
  return t(`applications.status.${status}`)
}

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

  if (loading) {
    return (
      <FleetTableSkeleton columnCount={APPLICATIONS_COLUMN_COUNT} label={t('applications.loading')} />
    )
  }
  if (applications.length === 0) return <p className={styles.kicker}>{t('applications.empty')}</p>

  return (
    <div className={styles.tableScroll}>
      <table className={styles.fleetTable}>
        <thead>
          <tr>
            <th>{t('applications.columns.name')}</th>
            <th>{t('applications.columns.taxId')}</th>
            <th>{t('applications.columns.contact')}</th>
            <th>{t('applications.columns.status')}</th>
            <th>{t('applications.columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id}>
              <td>
                {application.name}
                {application.duplicateDriverId !== null ? (
                  <span className={styles.applicationBadge} data-variant="warning">
                    {t('applications.duplicateBadge')}
                  </span>
                ) : null}
                {application.resubmittedAt !== null ? (
                  <span className={styles.applicationBadge} data-variant="info">
                    {t('applications.resubmittedBadge')}
                  </span>
                ) : null}
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
                      <button
                        disabled={isApproving}
                        type="button"
                        onClick={() => onApprove(application.id)}
                      >
                        {t('applications.approveButton')}
                      </button>
                    ) : (
                      <button
                        disabled={isApproving}
                        type="button"
                        onClick={() => onApprove(application.id)}
                      >
                        {t('applications.linkButton')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRejectDialog({ applicationId: application.id, reason: '' })}
                    >
                      {t('applications.rejectButton')}
                    </button>
                  </>
                ) : null}
                {application.duplicateDriverId !== null ? (
                  <button type="button" onClick={() => onViewDriver(application.name)}>
                    {t('applications.viewDriverButton')}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rejectDialog === null ? null : (
        <div className={styles.rejectDialog} role="dialog">
          <label>
            {t('applications.rejectionReasonLabel')}
            <textarea
              value={rejectDialog.reason}
              onChange={(event) =>
                setRejectDialog({ ...rejectDialog, reason: event.target.value })
              }
            />
          </label>
          <button
            disabled={isRejecting || rejectDialog.reason.trim().length === 0}
            type="button"
            onClick={() => {
              onReject({ id: rejectDialog.applicationId, rejectionReason: rejectDialog.reason })
              setRejectDialog(null)
            }}
          >
            {t('applications.confirmRejectButton')}
          </button>
          <button type="button" onClick={() => setRejectDialog(null)}>
            {t('applications.cancelButton')}
          </button>
        </div>
      )}
    </div>
  )
}
