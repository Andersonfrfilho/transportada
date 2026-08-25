/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useTripDocumentSelection } from '../hooks/useTripDocumentSelection.hook'
import type { TripDocumentLinkFormController } from '../hooks/useTripDocumentLinkForm.hook'
import type { TripWorkspaceController } from '../hooks/useTripWorkspace.hook'
import type { TripStatus } from '../shared/trip.types'
import { resolveFirstTripFeedbackKey } from '../shared/tripFeedback.service'
import { buildLinkTripDocumentBody } from '../shared/tripForm.service'
import { canIssueMdfe, selectPendingCteDocuments } from '../shared/tripMdfeGate.service'
import {
  createBrowserWorkspaceNavigator,
  navigateToMdfeManifests,
  navigateToNfeWorkspace,
} from '../shared/tripNavigation.service'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import { isTripEditable } from '../shared/tripStatus.service'
import { DeliveryAddressOverrideDialog } from './DeliveryAddressOverrideDialog.component'
import { TripMdfePendingDialog } from './TripMdfePendingDialog.component'
import { TripProgressBar } from './TripProgressBar.component'
import { TripScanQueue } from './TripScanQueue.component'
import { TripStopDocumentGroup, TripStopList } from './TripStopList.component'
import styles from '../styles/trip.module.css'

type TripDetailProps = Readonly<{
  linkForm: TripDocumentLinkFormController
  onClose: () => void
  workspace: TripWorkspaceController
}>

function statusClassName(status: TripStatus): string {
  return status === 'completed' || status === 'cancelled'
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
  const [overrideDocumentId, setOverrideDocumentId] = useState<string | null>(null)
  const selection = useTripDocumentSelection()

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
  const isEditable = isTripEditable(trip.status)
  const isCompleted = trip.status === 'completed'
  const pendingCteDocuments = selectPendingCteDocuments(trip.documents)
  const unassignedDocuments = trip.documents.filter((document) => document.stopId === null)
  const documentActions = {
    canManage,
    isDeliverPending: workspace.deliverDocumentMutation.isPending,
    isEditable,
    isReleasePending: workspace.releaseDocumentMutation.isPending,
    onDeliver: (documentId: string) =>
      workspace.deliverDocumentMutation.mutate({ documentId, tripId: trip.id }),
    onOverrideAddress: (documentId: string) => setOverrideDocumentId(documentId),
    onRelease: (documentId: string) =>
      workspace.releaseDocumentMutation.mutate({ documentId, tripId: trip.id }),
  }
  const overrideDocument = trip.documents.find((document) => document.id === overrideDocumentId)
  const feedbackKey = resolveFirstTripFeedbackKey([
    workspace.linkDocumentMutation.error,
    workspace.deliverDocumentMutation.error,
    workspace.releaseDocumentMutation.error,
    workspace.closeMutation.error,
    workspace.reorderStopsMutation.error,
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

  function handleReorderStops(stopIds: readonly string[]): void {
    if (trip === undefined) return
    workspace.reorderStopsMutation.mutate({ stopIds, tripId: trip.id })
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

      <TripProgressBar documents={trip.documents} />

      {selection.selectedIds.size > 0 ? (
        <div className={styles.selectionBar} role="status">
          <span>{t('stops.selectionCount', { count: selection.selectedIds.size })}</span>
          <Button onClick={selection.clear} size="sm" type="button" variant="ghost">
            {t('stops.selectionClear')}
          </Button>
        </div>
      ) : null}

      <TripStopList
        actions={documentActions}
        canReorder={isEditable}
        onReorder={handleReorderStops}
        selection={selection}
        stops={trip.stops}
      />

      {unassignedDocuments.length === 0 ? null : (
        <div className={styles.stopCard}>
          <div className={styles.stopCardHead}>
            <span className={styles.stopLabel}>{t('stops.unassigned')}</span>
            <span className={styles.stopCounter}>
              {t('stops.documentCount', { count: unassignedDocuments.length })}
            </span>
          </div>
          <TripStopDocumentGroup
            actions={documentActions}
            documents={unassignedDocuments}
            selection={selection}
          />
        </div>
      )}

      {trip.documents.length === 0 ? (
        <p className={styles.hint}>{t('detail.documentsEmpty')}</p>
      ) : null}

      {canManage && isEditable ? (
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
          <TripScanQueue entries={linkForm.scanEntries} onClear={linkForm.clearScanEntries} />
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
        {canManage && !isCompleted && trip.documents.length > 0 ? (
          <Button onClick={handleIssueMdfe} size="sm" type="button">
            <Icon name="link" />
            {t('actions.issueMdfe')}
          </Button>
        ) : null}
        {canManage && !isCompleted ? (
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

      <DeliveryAddressOverrideDialog
        documentId={overrideDocumentId ?? ''}
        documentLabel={overrideDocument === undefined ? '' : tripDocumentLabel(overrideDocument)}
        isOpen={overrideDocumentId !== null}
        loadHistory={() =>
          workspace.controller.listDeliveryAddressHistory({
            documentId: overrideDocumentId ?? '',
            tripId: trip.id,
          })
        }
        onClose={() => setOverrideDocumentId(null)}
        onOverride={(body) => workspace.overrideDeliveryAddressMutation.mutateAsync(body)}
        tripId={trip.id}
      />
    </section>
  )
}
