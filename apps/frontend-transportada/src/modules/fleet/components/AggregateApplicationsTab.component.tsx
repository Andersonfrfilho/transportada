/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { AggregateApplicationAttachments } from './AggregateApplicationAttachments.component'

import { FleetTableSkeleton } from './FleetTableSkeleton.component'
import type { AggregateApplication } from '../shared/aggregateApplicationClient.service'
import {
  formatDeclaredAddress,
  parseDeclaredData,
} from '../shared/aggregateApplicationDeclaredData.service'
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
      <FleetTableSkeleton
        columnCount={APPLICATIONS_COLUMN_COUNT}
        label={t('applications.loading')}
      />
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
          {applications.map((application) => {
            const declared = parseDeclaredData(application.declaredData)
            return (
              <Fragment key={application.id}>
                <tr>
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
                          onClick={() =>
                            setRejectDialog({ applicationId: application.id, reason: '' })
                          }
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
                <tr>
                  <td
                    className={styles.applicationDeclaredDataCell}
                    colSpan={APPLICATIONS_COLUMN_COUNT}
                  >
                    <AggregateApplicationAttachments application={application} />
                    <details>
                      <summary>{t('applications.declaredData.toggleShow')}</summary>
                      {declared.driver === null && declared.vehicle === null ? (
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
                      )}
                    </details>
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {rejectDialog === null ? null : (
        <div className={styles.rejectDialog} role="dialog">
          <label>
            {t('applications.rejectionReasonLabel')}
            <textarea
              value={rejectDialog.reason}
              onChange={(event) => setRejectDialog({ ...rejectDialog, reason: event.target.value })}
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
