/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { TripDocumentLinkFormController } from '../hooks/useTripDocumentLinkForm.hook'
import type { TripWorkspaceController } from '../hooks/useTripWorkspace.hook'
import type { TripStatus } from '../shared/trip.types'
import {
  hasTripDocumentFiscalWarning,
  tripDocumentLabel,
  tripFiscalStatusKey,
} from '../shared/tripDocument.service'
import { resolveFirstTripFeedbackKey } from '../shared/tripFeedback.service'
import { buildLinkTripDocumentBody } from '../shared/tripForm.service'
import { canIssueMdfe, selectPendingCteDocuments } from '../shared/tripMdfeGate.service'
import {
  createBrowserWorkspaceNavigator,
  navigateToMdfeManifests,
  navigateToNfeWorkspace,
} from '../shared/tripNavigation.service'
import { TripMdfePendingDialog } from './TripMdfePendingDialog.component'
import styles from '../styles/trip.module.css'

type TripDetailProps = Readonly<{
  linkForm: TripDocumentLinkFormController
  onClose: () => void
  workspace: TripWorkspaceController
}>

function statusClassName(status: TripStatus): string {
  return status === 'closed'
    ? `${styles.statusBadge} ${styles.statusReady}`
    : `${styles.statusBadge}`
}

// Mesma forma do painel real (cabeçalho + situação, motoristas, tabela de notas) — reaproveitado
// pelo gate de página e pelo gate interno para não trocar de forma entre os dois esqueletos.
export function TripDetailSkeleton() {
  const { t } = useTranslation('trip')

  return (
    <SkeletonGroup className={styles.panel} label={t('loading')}>
      <div className={styles.panelHead}>
        <Skeleton variant="text" width="10rem" />
        <Skeleton height="1.4rem" width="5rem" />
      </div>
      <Skeleton variant="text" width="14rem" />
      <div className={styles.driverChecklist}>
        <Skeleton height="1.25rem" width="7rem" />
        <Skeleton height="1.25rem" width="6rem" />
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th scope="col">{t('detail.documentColumn')}</th>
              <th scope="col">{t('detail.fiscalStatusColumn')}</th>
              <th scope="col">{t('detail.deliveredColumn')}</th>
              <th scope="col">{t('actions.title')}</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }, (_, index) => (
              <tr key={index}>
                <td>
                  <Skeleton variant="text" width="70%" />
                </td>
                <td>
                  <Skeleton variant="text" width="55%" />
                </td>
                <td>
                  <Skeleton variant="text" width="40%" />
                </td>
                <td>
                  <Skeleton height="var(--field-height-compact)" width="5rem" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SkeletonGroup>
  )
}

export function TripDetail({ linkForm, onClose, workspace }: TripDetailProps) {
  const { t } = useTranslation('trip')
  const trip = workspace.trip
  const [isMdfeGateOpen, setIsMdfeGateOpen] = useState(false)

  if (workspace.status === 'forbidden') {
    return (
      <p className={styles.hint} role="alert">
        {t('forbidden')}
      </p>
    )
  }
  if (workspace.status === 'loading') return <TripDetailSkeleton />
  if (workspace.status === 'error' || trip === undefined) {
    return (
      <p className={styles.hint} role="alert">
        {t('error')}
      </p>
    )
  }

  const canManage = workspace.controller.canManageTrips
  const isClosed = trip.status === 'closed'
  const pendingCteDocuments = selectPendingCteDocuments(trip.documents)
  const feedbackKey = resolveFirstTripFeedbackKey([
    workspace.linkDocumentMutation.error,
    workspace.deliverDocumentMutation.error,
    workspace.releaseDocumentMutation.error,
    workspace.closeMutation.error,
  ])

  /** A chave lida vira identificador antes do vínculo: a rota não conhece chave de acesso. */
  async function handleLinkDocument(): Promise<void> {
    if (trip === undefined) return
    const documentId = await linkForm.resolveDocumentId()
    if (documentId === undefined) return
    const body = buildLinkTripDocumentBody({ mode: linkForm.draft.mode, value: documentId })
    workspace.linkDocumentMutation.mutate(
      { ...body, tripId: trip.id },
      { onSuccess: linkForm.reset },
    )
  }

  function handleCloseTrip(): void {
    if (trip === undefined) return
    workspace.closeMutation.mutate({ tripId: trip.id })
  }

  function handleIssueMdfe(): void {
    if (trip === undefined) return
    if (!canIssueMdfe(trip.documents)) {
      setIsMdfeGateOpen(true)
      return
    }
    navigateToMdfeManifests({ navigator: createBrowserWorkspaceNavigator(), tripId: trip.id })
  }

  function handleGoToCteEmission(): void {
    setIsMdfeGateOpen(false)
    navigateToNfeWorkspace(createBrowserWorkspaceNavigator())
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-detail-title">
      <div className={styles.panelHead}>
        <h2 id="trip-detail-title">{t('detail.title')}</h2>
        <span className={statusClassName(trip.status)}>{t(`status.${trip.status}`)}</span>
      </div>

      {feedbackKey === null ? null : (
        <p className={styles.alert} role="alert">
          {t(`feedback.${feedbackKey}`)}
        </p>
      )}

      <p className={styles.summaryLine}>{t('detail.vehicle', { vehicleId: trip.vehicleId })}</p>

      <fieldset className={styles.driverChecklist}>
        <legend className={styles.hint}>{t('detail.drivers')}</legend>
        {trip.drivers.map((driver) => (
          <span key={driver.driverId}>{driver.driverName}</span>
        ))}
      </fieldset>

      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th scope="col">{t('detail.documentColumn')}</th>
              <th scope="col">{t('detail.fiscalStatusColumn')}</th>
              <th scope="col">{t('detail.deliveredColumn')}</th>
              <th scope="col">{t('actions.title')}</th>
            </tr>
          </thead>
          <tbody>
            {trip.documents.map((document) => (
              <tr
                className={hasTripDocumentFiscalWarning(document) ? styles.warningRow : undefined}
                key={document.id}
              >
                <td>{tripDocumentLabel(document)}</td>
                <td>
                  {t(tripFiscalStatusKey(document.fiscalStatus), {
                    defaultValue: document.fiscalStatus,
                  })}
                  {hasTripDocumentFiscalWarning(document) ? (
                    <span className={styles.fiscalWarning}>{t('detail.fiscalWarning')}</span>
                  ) : null}
                </td>
                <td>
                  {document.deliveredAt === null ? t('detail.pending') : document.deliveredAt}
                </td>
                <td>
                  <div className={styles.rowActions}>
                    {canManage && !isClosed && document.deliveredAt === null ? (
                      <Button
                        disabled={workspace.deliverDocumentMutation.isPending}
                        onClick={() =>
                          workspace.deliverDocumentMutation.mutate({
                            documentId: document.id,
                            tripId: trip.id,
                          })
                        }
                        size="sm"
                        type="button"
                      >
                        <Icon name="check" />
                        {t('actions.deliver')}
                      </Button>
                    ) : null}
                    {canManage && !isClosed ? (
                      <Button
                        disabled={workspace.releaseDocumentMutation.isPending}
                        onClick={() =>
                          workspace.releaseDocumentMutation.mutate({
                            documentId: document.id,
                            tripId: trip.id,
                          })
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Icon name="remove" />
                        {t('actions.release')}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {trip.documents.length === 0 ? (
        <p className={styles.hint}>{t('detail.documentsEmpty')}</p>
      ) : null}

      {canManage && !isClosed ? (
        <div className={styles.actionForm}>
          <h3>{t('detail.linkDocumentTitle')}</h3>
          <div className={styles.fieldGrid}>
            <label>
              {t('detail.linkMode')}
              <Select
                ariaLabel={t('detail.linkMode')}
                options={[
                  { label: t('detail.linkModeNfe'), value: 'nfe' },
                  { label: t('detail.linkModeFreight'), value: 'freight' },
                ]}
                value={linkForm.draft.mode}
                onChange={(value) => linkForm.setMode(value as 'freight' | 'nfe')}
              />
            </label>
            <label>
              {t('detail.linkValue')}
              <input
                autoComplete="off"
                onChange={(event) => linkForm.setValue(event.target.value)}
                value={linkForm.draft.value}
              />
              <span className={styles.hint}>{t('detail.linkValueHint')}</span>
            </label>
          </div>
          {linkForm.issue === undefined ? null : (
            <p className={styles.alert} role="alert">
              {t(`feedback.${linkForm.issue}`)}
            </p>
          )}
          <div className={styles.actionActions}>
            <Button
              disabled={
                linkForm.reference === undefined ||
                linkForm.isResolving ||
                workspace.linkDocumentMutation.isPending
              }
              onClick={() => void handleLinkDocument()}
              size="sm"
              type="button"
            >
              <Icon name="link" />
              {t('actions.linkDocument')}
            </Button>
            {linkForm.canScan ? (
              <Button onClick={linkForm.openScanner} size="sm" type="button" variant="secondary">
                <Icon name="camera" />
                {t('detail.scan')}
              </Button>
            ) : null}
          </div>
          <BarcodeScanner
            closeLabel={t('detail.scanClose')}
            deniedMessage={t('detail.scanDenied')}
            isOpen={linkForm.isScannerOpen}
            onClose={linkForm.closeScanner}
            onRead={linkForm.acceptScan}
            readingMessage={t('detail.scanReading')}
            startingMessage={t('detail.scanStarting')}
            title={t('detail.scanTitle')}
            unavailableMessage={t('detail.scanUnavailable')}
          />
        </div>
      ) : null}

      <div className={styles.actionActions}>
        {canManage && !isClosed && trip.documents.length > 0 ? (
          <Button onClick={handleIssueMdfe} size="sm" type="button">
            <Icon name="link" />
            {t('actions.issueMdfe')}
          </Button>
        ) : null}
        {canManage && !isClosed ? (
          <Button
            disabled={workspace.closeMutation.isPending}
            onClick={handleCloseTrip}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="power" />
            {t('actions.close')}
          </Button>
        ) : null}
        <Button onClick={onClose} size="sm" type="button" variant="ghost">
          <Icon name="chevron-left" />
          {t('actions.backToList')}
        </Button>
      </div>

      <TripMdfePendingDialog
        isOpen={isMdfeGateOpen}
        onClose={() => setIsMdfeGateOpen(false)}
        onGoToCteEmission={handleGoToCteEmission}
        pendingDocuments={pendingCteDocuments}
      />
    </section>
  )
}
