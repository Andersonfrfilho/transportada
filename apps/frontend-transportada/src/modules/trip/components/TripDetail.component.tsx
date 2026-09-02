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
import {
  canReturnDocuments,
  canSeparateOrLoadDocuments,
  isTripEditable,
} from '../shared/tripStatus.service'
import { DeliveryAddressOverrideDialog } from './DeliveryAddressOverrideDialog.component'
import { TripFiscalReadinessPanel } from './TripFiscalReadinessPanel.component'
import { TripMdfePendingDialog } from './TripMdfePendingDialog.component'
import { TripOccupancyPanel } from './TripOccupancy.component'
import { TripProgressBar } from './TripProgressBar.component'
import { TripReasonDialog } from './TripReasonDialog.component'
import { TripScanQueue } from './TripScanQueue.component'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { resolveVehicleColorSwatch } from '@/modules/fleet/shared/vehicleOption.service'

import { describeTripVehicle } from '../shared/vehicleSummary.service'
import { TripStateActions } from './TripStateActions.component'
import { TripStopDocumentGroup, TripStopList } from './TripStopList.component'
import { RouteSuggestionSection } from '@/modules/routing/components/RouteSuggestionSection.component'
import { useRouteSuggestion } from '@/modules/routing/hooks/useRouteSuggestion.hook'

import styles from '../styles/trip.module.css'

type TripDetailProps = Readonly<{
  linkForm: TripDocumentLinkFormController
  onClose: () => void
  /** A frota da empresa: é dela que sai a identificação do veículo, no lugar do UUID. */
  vehicles: readonly FleetVehicleDetail[]
  workspace: TripWorkspaceController
}>

/**
 * Veículo que saiu da frota (desativado, ou de outra empresa por defeito de escopo) ainda precisa
 * nomear alguma coisa: cair no identificador é pior que hoje só se ninguém disser que é isso. O
 * rótulo diz, e a viagem continua legível.
 */
function describeVehicle(
  vehicles: readonly FleetVehicleDetail[],
  vehicleId: string,
  translateFleet: (key: string) => string,
): string {
  const vehicle = vehicles.find((entry) => entry.id === vehicleId)
  if (vehicle === undefined) return vehicleId

  return describeTripVehicle({
    brand: vehicle.brand,
    colorLabel:
      resolveVehicleColorSwatch(vehicle.color) === undefined
        ? ''
        : translateFleet(`colorOption.${vehicle.color}`),
    model: vehicle.model,
    // `modelYear` é número na ficha e texto na linha: zero é ausência de cadastro, não ano zero.
    modelYear: vehicle.modelYear > 0 ? String(vehicle.modelYear) : '',
    plate: vehicle.plate,
  })
}

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

export function TripDetail({ linkForm, onClose, vehicles, workspace }: TripDetailProps) {
  const { t } = useTranslation('trip')
  const { t: tFleet } = useTranslation('fleet')
  const trip = workspace.trip
  const [isMdfeGateOpen, setIsMdfeGateOpen] = useState(false)
  const [overrideDocumentId, setOverrideDocumentId] = useState<string | null>(null)
  const [returnDocumentId, setReturnDocumentId] = useState<string | null>(null)
  /**
   * Spec 065 D4c: dispensar viagem com nota de CT-e não é um toque — é uma decisão que fica na
   * trilha, e o diálogo é onde o motivo é digitado antes de o servidor recusá-la sem ele.
   */
  const [isDispenseDialogOpen, setIsDispenseDialogOpen] = useState(false)
  const selection = useTripDocumentSelection()
  /**
   * Antes de qualquer `return`: hook depois de saída condicional muda a contagem de hooks entre
   * renders, e o React derruba o componente inteiro — foi o que o smoke pegou. A viagem ainda pode
   * não ter carregado, e `''` é um id que nunca resolve, o que é exatamente o que se quer aqui.
   */
  const routeSuggestion = useRouteSuggestion({ tripId: workspace.trip?.id ?? '' })

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
  const canSeparateOrLoad = canSeparateOrLoadDocuments(trip.status)
  const canReturn = canReturnDocuments(trip.status)
  const isCompleted = trip.status === 'completed'
  const pendingCteDocuments = selectPendingCteDocuments(trip.documents)
  const unassignedDocuments = trip.documents.filter((document) => document.stopId === null)
  const documentActions = {
    canManage,
    canReturn,
    canSeparateOrLoad,
    isDeliverPending: workspace.deliverDocumentMutation.isPending,
    isEditable,
    isReleasePending: workspace.releaseDocumentMutation.isPending,
    isTransitionPending: workspace.transitionDocumentMutation.isPending,
    onDeliver: (documentId: string) =>
      workspace.deliverDocumentMutation.mutate({ documentId, tripId: trip.id }),
    onLoad: (documentId: string) =>
      workspace.transitionDocumentMutation.mutate({ action: 'load', documentId, tripId: trip.id }),
    onOverrideAddress: (documentId: string) => setOverrideDocumentId(documentId),
    onRelease: (documentId: string) =>
      workspace.releaseDocumentMutation.mutate({ documentId, tripId: trip.id }),
    onReturn: (documentId: string) => setReturnDocumentId(documentId),
    onSeparate: (documentId: string) =>
      workspace.transitionDocumentMutation.mutate({
        action: 'separate',
        documentId,
        tripId: trip.id,
      }),
  }
  const overrideDocument = trip.documents.find((document) => document.id === overrideDocumentId)
  const returnDocument = trip.documents.find((document) => document.id === returnDocumentId)
  const feedbackKey = resolveFirstTripFeedbackKey([
    workspace.linkDocumentMutation.error,
    workspace.deliverDocumentMutation.error,
    workspace.releaseDocumentMutation.error,
    workspace.closeMutation.error,
    workspace.reorderStopsMutation.error,
    workspace.transitionDocumentMutation.error,
    workspace.batchStatusMutation.error,
    workspace.dispatchMutation.error,
    workspace.cancelMutation.error,
    workspace.planRouteMutation.error,
  ])

  /**
   * A dispensa de viagem com nota de CT-e passa pelo diálogo do motivo; os outros dois estados vão
   * direto, porque não há o que justificar em exigir manifesto nem em voltar ao automático.
   */
  function handleSetMdfeRequirement(requiresMdfe: boolean | null): void {
    if (trip === undefined) return
    if (requiresMdfe === false && (workspace.fiscalReadiness?.manifestableCount ?? 0) > 0) {
      setIsDispenseDialogOpen(true)
      return
    }
    workspace.setMdfeRequirementMutation.mutate({ reason: null, requiresMdfe, tripId: trip.id })
  }

  function handleReturnSubmit(reason: string): void {
    if (trip === undefined || returnDocumentId === null) return
    workspace.transitionDocumentMutation.mutate({
      action: 'return',
      documentId: returnDocumentId,
      returnReason: reason,
      tripId: trip.id,
    })
    setReturnDocumentId(null)
  }

  function handleBatch(input: {
    readonly action: 'load' | 'return' | 'separate'
    readonly returnReason?: string
  }): void {
    if (trip === undefined || selection.selectedIds.size === 0) return
    workspace.batchStatusMutation.mutate(
      {
        action: input.action,
        documentIds: [...selection.selectedIds],
        returnReason: input.returnReason ?? null,
        tripId: trip.id,
      },
      { onSuccess: selection.clear },
    )
  }

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

      <p className={styles.summaryLine}>
        {t('detail.vehicle', { vehicle: describeVehicle(vehicles, trip.vehicleId, tFleet) })}
      </p>

      <fieldset className={styles.driverChecklist}>
        <legend className={styles.hint}>{t('detail.drivers')}</legend>
        {trip.drivers.map((driver) => (
          <span key={driver.driverId}>{driver.driverName}</span>
        ))}
      </fieldset>

      <TripProgressBar documents={trip.documents} />

      <TripOccupancyPanel occupancy={trip.occupancy} />

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

      <TripStateActions
        canManage={canManage}
        canReturn={canReturn}
        canSeparateOrLoad={canSeparateOrLoad}
        isBatchPending={workspace.batchStatusMutation.isPending}
        isCancelPending={workspace.cancelMutation.isPending}
        isDispatchPending={workspace.dispatchMutation.isPending}
        isPlanRoutePending={workspace.planRouteMutation.isPending}
        onBatch={handleBatch}
        onCancel={() => workspace.cancelMutation.mutate({ tripId: trip.id })}
        onDispatch={(input) => workspace.dispatchMutation.mutate({ ...input, tripId: trip.id })}
        onPlanRoute={() => workspace.planRouteMutation.mutate({ tripId: trip.id })}
        selection={selection}
        trip={trip}
      />

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

      {/**
       * O roteiro se confere antes de a viagem sair. Ele fica acima das ações de propósito: quem
       * rola até "despachar" já passou pela proposta e pelos avisos dela.
       */}
      {canManage && isEditable ? <RouteSuggestionSection controller={routeSuggestion} /> : null}

      {/* A prontidão fica **acima** das ações: quem rola até "emitir" já sabe se dá para emitir */}
      <TripFiscalReadinessPanel
        canManageMdfe={workspace.controller.canManageMdfe}
        canSubmitCte={workspace.controller.canSubmitCte}
        documents={trip.documents}
        isGeneratingCteBatch={workspace.createCteBatchMutation.isPending}
        isSavingRequirement={workspace.setMdfeRequirementMutation.isPending}
        readiness={workspace.fiscalReadiness}
        requiresMdfe={trip.requiresMdfe}
        requiresMdfeReason={trip.requiresMdfeReason}
        onGenerateCteBatch={() => workspace.createCteBatchMutation.mutate({ tripId: trip.id })}
        onSetRequirement={handleSetMdfeRequirement}
      />

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

      <TripReasonDialog
        isOpen={isDispenseDialogOpen}
        isSubmitting={workspace.setMdfeRequirementMutation.isPending}
        onClose={() => setIsDispenseDialogOpen(false)}
        onSubmit={(reason) => {
          setIsDispenseDialogOpen(false)
          workspace.setMdfeRequirementMutation.mutate({
            reason,
            requiresMdfe: false,
            tripId: trip.id,
          })
        }}
        reasonLabel={t('requirement.dispenseReasonLabel')}
        subtitle={t('requirement.dispenseSubtitle')}
        submitLabel={t('requirement.dispense')}
        title={t('requirement.dispenseTitle')}
      />

      <TripReasonDialog
        isOpen={returnDocumentId !== null}
        isSubmitting={workspace.transitionDocumentMutation.isPending}
        onClose={() => setReturnDocumentId(null)}
        onSubmit={handleReturnSubmit}
        reasonLabel={t('stateActions.returnReasonLabel')}
        submitLabel={t('stateActions.returnSubmit')}
        {...(returnDocument === undefined
          ? {}
          : {
              subtitle: t('stateActions.returnSubtitle', {
                document: tripDocumentLabel(returnDocument),
              }),
            })}
        title={t('stateActions.returnTitle')}
      />
    </section>
  )
}
