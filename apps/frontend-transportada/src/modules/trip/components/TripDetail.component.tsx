/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatPhone } from '@/modules/shared/phone.service'
import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { toDisplayPersonName } from '@/modules/shared/personName.service'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useSlowLoadNotice } from '../hooks/useSlowLoadNotice.hook'
import { useTripDocumentSelection } from '../hooks/useTripDocumentSelection.hook'
import type { TripDocumentLinkFormController } from '../hooks/useTripDocumentLinkForm.hook'
import type { TripWorkspaceController } from '../hooks/useTripWorkspace.hook'
import { selectPendingCteDocumentIds } from '../shared/cteSelection.service'
import { DATABASE_UNAVAILABLE_ERROR_CODE, SLOW_LOAD_NOTICE_DELAY_MS } from '../shared/trip.constant'
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
import { canSeparateOrLoadDocuments, isTripEditable } from '../shared/tripStatus.service'
import {
  hasMultipleDrivers,
  resolveDefaultOnBehalfDriverId,
} from '../shared/tripFieldActions.service'
import type { DriverReturnReason } from '@/modules/driver-trip/shared/driverTrip.types'
import { DeliveryAddressOverrideDialog } from './DeliveryAddressOverrideDialog.component'
import { TripFiscalReadinessPanel } from './TripFiscalReadinessPanel.component'
import { TripMdfePendingDialog } from './TripMdfePendingDialog.component'
import { TripCargoPanel } from './TripCargoPanel.component'
import { TripReviewQueue } from './TripReviewQueue.component'
import { TripDeliveryProof } from './TripDeliveryProof.component'
import { TripOccurrences } from './TripOccurrences.component'
import { TripRouteMap } from './TripRouteMap.component'
import { resolveDeliveryProofView } from '../shared/deliveryProof.service'
import { resolveTripProgress } from '../shared/tripProgress.service'
import type { TripDocumentDetail } from '../shared/trip.types'
import { TripProcessFlow } from './TripProcessFlow.component'
import { TripReasonDialog } from './TripReasonDialog.component'
import { TripReturnReasonDialog } from './TripReturnReasonDialog.component'
import { TripScanQueue } from './TripScanQueue.component'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { resolveVehicleColorSwatch } from '@/modules/fleet/shared/vehicleOption.service'

import { describeTripVehicle } from '../shared/vehicleSummary.service'
import { FieldOccurrenceDialog } from './FieldOccurrenceDialog.component'
import { TripFieldActions } from './TripFieldActions.component'
import { TripStateActions } from './TripStateActions.component'
import { TripStopDocumentGroup, TripStopList } from './TripStopList.component'
import { RouteSuggestionSection } from '@/modules/routing/components/RouteSuggestionSection.component'
import { useRouteSuggestion } from '@/modules/routing/hooks/useRouteSuggestion.hook'

import styles from '../styles/trip.module.css'

type TripDetailProps = Readonly<{
  /** RF7 (spec 154): sem `settings.manage` o extrato de pedágio não oferece o ajuste da praça. */
  canAdjustTollBooth: boolean
  linkForm: TripDocumentLinkFormController
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

type TripDetailSkeletonProps = Readonly<{
  label?: string
}>

// Mesma forma do painel real (cabeçalho + situação, motoristas, tabela de notas) — reaproveitado
// pelo gate de página e pelo gate interno para não trocar de forma entre os dois esqueletos.
export function TripDetailSkeleton({ label }: TripDetailSkeletonProps = {}) {
  const { t } = useTranslation('trip')

  return (
    <SkeletonGroup className={styles.panel} label={label ?? t('loading')}>
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

export function TripDetail({ canAdjustTollBooth, linkForm, vehicles, workspace }: TripDetailProps) {
  const { t } = useTranslation('trip')
  const { t: tFleet } = useTranslation('fleet')
  const trip = workspace.trip
  const [isMdfeGateOpen, setIsMdfeGateOpen] = useState(false)
  const [overrideDocumentId, setOverrideDocumentId] = useState<string | null>(null)
  const [returnDocumentId, setReturnDocumentId] = useState<string | null>(null)
  /**
   * Spec 156 T8b: mesmo seletor/decisão de `driverId` que `TripFieldActions` (T8) usa — só aparece
   * quando a viagem tem mais de um motorista (`hasMultipleDrivers`), e o padrão é o de `position = 1`
   * (`resolveDefaultOnBehalfDriverId`, ADR-0067 §2).
   */
  const [selectedOfficeDriverId, setSelectedOfficeDriverId] = useState('')
  /**
   * Spec 065 D4c: dispensar viagem com nota de CT-e não é um toque — é uma decisão que fica na
   * trilha, e o diálogo é onde o motivo é digitado antes de o servidor recusá-la sem ele.
   */
  const [isDispenseDialogOpen, setIsDispenseDialogOpen] = useState(false)
  const selection = useTripDocumentSelection()
  /**
   * Spec 156 T9: uma nota (ação da linha) ou o maço da seleção (ação em massa) — `null` fecha o
   * diálogo. As duas entradas passam pelo mesmo estado porque é o mesmo formulário.
   */
  const [fieldOccurrenceDocumentIds, setFieldOccurrenceDocumentIds] = useState<
    readonly string[] | null
  >(null)
  /**
   * Antes de qualquer `return`: hook depois de saída condicional muda a contagem de hooks entre
   * renders, e o React derruba o componente inteiro — foi o que o smoke pegou. A viagem ainda pode
   * não ter carregado, e `''` é um id que nunca resolve, o que é exatamente o que se quer aqui.
   */
  const routeSuggestion = useRouteSuggestion({ tripId: workspace.trip?.id ?? '' })
  const isSlowLoad = useSlowLoadNotice({
    delayMs: SLOW_LOAD_NOTICE_DELAY_MS,
    isPending: workspace.status === 'loading',
  })

  if (workspace.status === 'forbidden') {
    return (
      <p className={styles.hint} role="alert">
        {t('forbidden')}
      </p>
    )
  }
  if (workspace.status === 'loading') {
    return (
      <div className={styles.deck}>
        <TripDetailSkeleton label={t('detail.loading')} />
        {isSlowLoad ? (
          <p aria-live="polite" className={styles.hint}>
            {t('detail.loadingSlow')}
          </p>
        ) : null}
      </div>
    )
  }
  if (workspace.status === 'error' || trip === undefined) {
    const isDatabaseUnavailable =
      workspace.tripQuery.error?.message === DATABASE_UNAVAILABLE_ERROR_CODE
    return (
      <div className={styles.deck}>
        <p className={styles.hint} role="alert">
          {t('detail.error')}
          {isDatabaseUnavailable ? ` ${t('detail.errorUnavailable')}` : null}
        </p>
        <Button onClick={() => workspace.refetchTrip()} size="sm" type="button" variant="ghost">
          <Icon name="refresh" />
          {t('detail.retry')}
        </Button>
      </div>
    )
  }

  const canManage = workspace.controller.canManageTrips
  /**
   * Spec 156 D11/T8: geometria, agendamento, prontidão fiscal e produtos continuam só em
   * `fleet.read` — o `finance` (`trip.report-on-behalf`) recebe 403 nessas rotas. O painel fica
   * **oculto**, não quebrado: mostrar "sem acesso" a cada um seria ruído para quem nunca teve o
   * botão de configurar isso.
   */
  const canReadFleetDetails = workspace.controller.canReadTripFleetDetails
  const isEditable = isTripEditable(trip.status)
  const canSeparateOrLoad = canSeparateOrLoadDocuments(trip.status)
  const isCompleted = trip.status === 'completed'
  const pendingCteDocuments = selectPendingCteDocuments(trip.documents)
  const unassignedDocuments = trip.documents.filter((document) => document.stopId === null)
  const canFieldOccurrenceBatch =
    workspace.controller.canReportOnBehalf &&
    [...selection.selectedIds].some((documentId) =>
      workspace.fieldActionCapabilities.canDocument(documentId, 'fieldOccurrence'),
    )
  /**
   * Spec 156 T8b (revisão): o motorista escolhido só vale se estiver na tripulação da viagem
   * **atual** — a página não remonta ao trocar de viagem (`workspace.trip` muda sob o mesmo
   * componente), então um id escolhido na viagem anterior sobreviveria aqui sem essa checagem.
   */
  const isSelectedDriverOnTrip = trip.drivers.some(
    (driver) => driver.driverId === selectedOfficeDriverId,
  )
  const officeDriverId = isSelectedDriverOnTrip
    ? selectedOfficeDriverId
    : resolveDefaultOnBehalfDriverId(trip.drivers)
  /** `exactOptionalPropertyTypes` recusa `{ driverId: undefined }` — o espalhamento omite a chave. */
  const officeDriverIdInput = officeDriverId === undefined ? {} : { driverId: officeDriverId }
  const documentActions = {
    canManage,
    canSeparateOrLoad,
    canFieldOccurrence: (documentId: string) =>
      workspace.fieldActionCapabilities.canDocument(documentId, 'fieldOccurrence'),
    capabilities: workspace.fieldActionCapabilities,
    onOpenFieldOccurrence: (documentId: string) => setFieldOccurrenceDocumentIds([documentId]),
    onToggleProof: (documentId: string) =>
      workspace.setOpenProofDocumentId(
        workspace.openProofDocumentId === documentId ? null : documentId,
      ),
    openProofDocumentId: workspace.openProofDocumentId,
    renderProof: (documentId: string) => (
      <TripDeliveryProofLoader
        documentId={documentId}
        documents={trip.documents}
        workspace={workspace}
      />
    ),
    isDeliverPending: workspace.fieldDeliverDocumentMutation.isPending,
    isEditable,
    isReleasePending: workspace.releaseDocumentMutation.isPending,
    isReturnPending: workspace.fieldReturnDocumentMutation.isPending,
    isTransitionPending: workspace.transitionDocumentMutation.isPending,
    onFieldDeliver: (documentId: string) =>
      workspace.fieldDeliverDocumentMutation.mutate({
        deliveredAt: new Date().toISOString(),
        documentId,
        ...officeDriverIdInput,
        tripId: trip.id,
      }),
    onFieldReturn: (documentId: string) => setReturnDocumentId(documentId),
    onLoad: (documentId: string) =>
      workspace.transitionDocumentMutation.mutate({ action: 'load', documentId, tripId: trip.id }),
    onOverrideAddress: (documentId: string) => setOverrideDocumentId(documentId),
    onRelease: (documentId: string) =>
      workspace.releaseDocumentMutation.mutate({ documentId, tripId: trip.id }),
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
    workspace.fieldDeliverDocumentMutation.error,
    workspace.fieldReturnDocumentMutation.error,
    workspace.releaseDocumentMutation.error,
    workspace.closeMutation.error,
    workspace.reorderStopsMutation.error,
    workspace.transitionDocumentMutation.error,
    workspace.batchStatusMutation.error,
    workspace.dispatchMutation.error,
    workspace.cancelMutation.error,
    workspace.planRouteMutation.error,
    workspace.confirmLoadTripMutation.error,
    workspace.startFieldTripMutation.error,
    workspace.reportStopArrivalMutation.error,
    workspace.reportStopOccurrenceMutation.error,
    workspace.registerFieldOccurrencesMutation.error,
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

  function handleReturnSubmit(reason: DriverReturnReason): void {
    if (trip === undefined || returnDocumentId === null) return
    workspace.fieldReturnDocumentMutation.mutate({
      documentId: returnDocumentId,
      ...officeDriverIdInput,
      reason,
      tripId: trip.id,
    })
    setReturnDocumentId(null)
  }

  function handleBatch(input: { readonly action: 'load' | 'separate' }): void {
    if (trip === undefined || selection.selectedIds.size === 0) return
    workspace.batchStatusMutation.mutate(
      { action: input.action, documentIds: [...selection.selectedIds], tripId: trip.id },
      { onSuccess: selection.clear },
    )
  }

  /**
   * Spec 156 T8b: uma `field-return` por nota selecionada que aceite `fieldReturn` — o lote do
   * escritório com autoria é individual, não existe rota de lote para ele.
   */
  function handleBatchReturn(reason: DriverReturnReason): void {
    if (trip === undefined) return
    const documentIds = [...selection.selectedIds].filter((documentId) =>
      workspace.fieldActionCapabilities.canDocument(documentId, 'fieldReturn'),
    )
    if (documentIds.length === 0) return
    workspace.batchFieldReturnMutation.mutate(
      { documentIds, ...officeDriverIdInput, reason, tripId: trip.id },
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

      {/*
       * Spec 156 D11: sem `fleet.read` a viagem não traz placa nenhuma — só o `vehicleId` bruto — e
       * mostrá-lo vazaria o identificador interno em vez de omitir a linha (t7-design §2.6).
       */}
      {canReadFleetDetails ? (
        <p className={styles.summaryLine}>
          {t('detail.vehicle', { vehicle: describeVehicle(vehicles, trip.vehicleId, tFleet) })}
        </p>
      ) : null}

      <fieldset className={styles.driverChecklist}>
        <legend className={styles.hint}>{t('detail.drivers')}</legend>
        {/*
         * Nome sozinho obrigava a abrir a frota noutra aba para achar o telefone. O contato é
         * **link**, não texto: quem está no galpão toca e liga, sem copiar número à mão.
         */}
        {trip.drivers.map((driver) => {
          /**
           * `??` e não `=== ''`: o contato nasceu opcional (spec 078 D2), e uma API anterior o
           * serve **ausente**. Tratá-lo como sempre presente derrubava a tela inteira em
           * `formatPhone(undefined)` — a mesma armadilha do rótulo que imprimia `undefined/`.
           */
          const phone = driver.driverPhone ?? ''
          const email = driver.driverEmail ?? ''

          return (
            <span className={styles.driverLine} key={driver.driverId}>
              <strong>{toDisplayPersonName(driver.driverName)}</strong>
              {phone === '' ? null : (
                <a href={`tel:${phone}`}>
                  <Icon name="send" />
                  {formatPhone(phone)}
                </a>
              )}
              {email === '' ? null : (
                <a href={`mailto:${email}`}>
                  <Icon name="copy" />
                  {email}
                </a>
              )}
            </span>
          )
        })}
      </fieldset>

      {/*
       * O botão fica **ao lado** do automático, não no lugar dele: quem está no galpão esperando a
       * baixa não espera meio minuto, e quem só acompanha não deve apertar nada.
       */}
      <Button onClick={() => workspace.refetchTrip()} size="sm" type="button" variant="ghost">
        <Icon name="refresh" />
        {t('detail.refreshNow')}
      </Button>

      <TripProcessFlow
        documents={trip.documents}
        progress={resolveTripProgress({
          now: new Date().toISOString(),
          status: trip.status,
          stops: trip.stops,
        })}
      />

      {/*
        ⚠️ O tipo do veículo vem da frota carregada, não da viagem: o corpo do detalhe traz o
        `vehicleId` e nada mais. Sem ele a silhueta cai no contorno genérico — e quem abre o detalhe
        de um truck via um desenho de VUC, com a escala errada entre os tipos.
      */}
      <TripCargoPanel
        cargoWeight={trip.cargoWeight ?? null}
        layout={trip.cargoLayout}
        layoutView={workspace.cargoLayoutView}
        occupancy={trip.occupancy}
        reviewQueue={
          <TripReviewQueue
            canManage={canManage}
            isEditable={isEditable}
            layoutId={trip.cargoLayoutId ?? null}
            target={{ kind: 'trip', tripId: trip.id, vehicles }}
            unplaced={
              (workspace.cargoLayoutView?.layout ?? trip.cargoLayout)?.placement?.unplaced ?? []
            }
          />
        }
        vehicleType={vehicles.find((entry) => entry.id === trip.vehicleId)?.vehicleType ?? ''}
      />

      {/* Spec 156 D11: geometria é `fleet.read` — sem ela, oculta em vez de bater 403 sozinha. */}
      {canReadFleetDetails ? (
        <TripRouteMap
          canAdjustTollBooth={canAdjustTollBooth}
          canCorrect={canManage}
          geometry={workspace.routeGeometryQuery.data ?? null}
          stops={trip.stops}
          isCorrecting={workspace.correctAddressMutation.isPending}
          isGeometryError={workspace.routeGeometryQuery.isError}
          isGeometryPending={workspace.routeGeometryQuery.isPending}
          onCorrect={(correction) => workspace.correctAddressMutation.mutate(correction)}
          onRetryGeometry={() => void workspace.routeGeometryQuery.refetch()}
        />
      ) : null}

      {selection.selectedIds.size > 0 ? (
        <div className={styles.selectionBar} role="status">
          <span>{t('stops.selectionCount', { count: selection.selectedIds.size })}</span>
          <Button onClick={selection.clear} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('stops.selectionClear')}
          </Button>
        </div>
      ) : null}

      {/*
       * Spec 079 T021: **vincular e agir vêm antes da lista.** Numa viagem com doze paradas os dois
       * ficavam abaixo de tudo, e quem abria a tela para despachar rolava a viagem inteira para
       * achar o botão. O que se **lê** — progresso, ocupação, mapa de carga — continua acima: mover
       * os botões para o topo de tudo trocaria um problema de ordem por outro.
       */}
      <TripStateActions
        canManage={canManage}
        canFieldOccurrenceBatch={canFieldOccurrenceBatch}
        canSeparateOrLoad={canSeparateOrLoad}
        capabilities={workspace.fieldActionCapabilities}
        isBatchPending={workspace.batchStatusMutation.isPending}
        isBatchReturnPending={workspace.batchFieldReturnMutation.isPending}
        isCancelPending={workspace.cancelMutation.isPending}
        isDispatchPending={workspace.dispatchMutation.isPending}
        isPlanRoutePending={workspace.planRouteMutation.isPending}
        onBatch={handleBatch}
        onBatchReturn={handleBatchReturn}
        onCancel={() => workspace.cancelMutation.mutate({ tripId: trip.id })}
        onDispatch={(input) => workspace.dispatchMutation.mutate({ ...input, tripId: trip.id })}
        onOpenFieldOccurrenceBatch={() => setFieldOccurrenceDocumentIds([...selection.selectedIds])}
        onPlanRoute={() => workspace.planRouteMutation.mutate({ tripId: trip.id })}
        isGeneratingCteBatch={workspace.createCteBatchMutation.isPending}
        pendingCteSelection={
          workspace.controller.canSubmitCte
            ? selectPendingCteDocumentIds({
                documents: workspace.fiscalReadiness?.documents,
                selectedIds: selection.selectedIds,
              })
            : []
        }
        onGenerateCteSelection={(tripDocumentIds) =>
          workspace.createCteBatchMutation.mutate({ tripDocumentIds, tripId: trip.id })
        }
        selection={selection}
        trip={trip}
      />

      <TripFieldActions
        canReportOnBehalf={workspace.controller.canReportOnBehalf}
        capabilities={workspace.fieldActionCapabilities}
        isArrivePending={workspace.reportStopArrivalMutation.isPending}
        isConfirmLoadPending={workspace.confirmLoadTripMutation.isPending}
        isOccurrencePending={workspace.reportStopOccurrenceMutation.isPending}
        isStartRoutePending={workspace.startFieldTripMutation.isPending}
        onArrive={(input) =>
          workspace.reportStopArrivalMutation.mutate({ ...input, tripId: trip.id })
        }
        onConfirmLoad={(input) =>
          workspace.confirmLoadTripMutation.mutate({ ...input, tripId: trip.id })
        }
        onRegisterStopOccurrence={(input) =>
          workspace.reportStopOccurrenceMutation.mutate({ ...input, tripId: trip.id })
        }
        onSelectDriverId={setSelectedOfficeDriverId}
        onStartRoute={(input) =>
          workspace.startFieldTripMutation.mutate({ ...input, tripId: trip.id })
        }
        selectedDriverId={officeDriverId ?? ''}
        trip={trip}
      />

      <FieldOccurrenceDialog
        documentIds={fieldOccurrenceDocumentIds ?? []}
        drivers={trip.drivers}
        hasMultipleDrivers={hasMultipleDrivers(trip.drivers)}
        isOpen={fieldOccurrenceDocumentIds !== null}
        isSubmitting={workspace.registerFieldOccurrencesMutation.isPending}
        onClose={() => setFieldOccurrenceDocumentIds(null)}
        onSubmit={(input) => {
          if (fieldOccurrenceDocumentIds === null) return
          workspace.registerFieldOccurrencesMutation.mutate(
            { ...input, documentIds: fieldOccurrenceDocumentIds, tripId: trip.id },
            { onSuccess: () => setFieldOccurrenceDocumentIds(null) },
          )
        }}
        types={workspace.fieldOccurrenceTypesQuery.data ?? []}
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

      {/*
       * A lista de cargas é leitura antes de ser ação: ela fica fora do formulário de vínculo. Dentro
       * dele caía na fileira flexível dos botões, embaralhada com eles, e sumia de vez quando a
       * viagem saía do barracão — justamente quando o escritório acompanha as entregas.
       */}
      <section className={styles.stopSection}>
        <h3>{t('stops.title')}</h3>
        <TripStopList
          actions={documentActions}
          canReorder={canManage && isEditable}
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
      </section>

      {/**
       * O roteiro se confere antes de a viagem sair. Ele fica acima das ações de propósito: quem
       * rola até "despachar" já passou pela proposta e pelos avisos dela.
       */}
      {canManage && isEditable ? <RouteSuggestionSection controller={routeSuggestion} /> : null}

      {/* A prontidão fica **acima** das ações: quem rola até "emitir" já sabe se dá para emitir */}
      {/* Spec 156 D11: prontidão fiscal é `fleet.read` — sem ela, oculta em vez de bater 403. */}
      {canReadFleetDetails ? (
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

      <TripReturnReasonDialog
        isOpen={returnDocumentId !== null}
        isSubmitting={workspace.fieldReturnDocumentMutation.isPending}
        onClose={() => setReturnDocumentId(null)}
        onSubmit={handleReturnSubmit}
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

/**
 * O carregador do comprovante. Ele existe para o painel **não** guardar a URL assinada em estado
 * próprio: o que a consulta trouxe é o que a tela mostra, e reabrir o painel busca de novo — a URL
 * expira em cinco minutos, e uma cópia guardada viraria imagem quebrada sem explicação.
 */
function TripDeliveryProofLoader({
  documents,
  documentId,
  workspace,
}: Readonly<{
  documentId: string
  documents: readonly TripDocumentDetail[]
  workspace: TripWorkspaceController
}>) {
  const document = documents.find((candidate) => candidate.id === documentId)
  if (document === undefined) return null

  if (workspace.deliveryProofsQuery.isLoading) return <Skeleton variant="text" width="60%" />

  return (
    <TripDeliveryProof
      occurrences={
        <TripOccurrences
          canRegister={workspace.controller.canManageTrips}
          email={workspace.registerOccurrenceMutation.data?.email ?? null}
          isRegistering={workspace.registerOccurrenceMutation.isPending}
          occurrences={workspace.occurrencesQuery.data ?? []}
          onRegister={(occurrence) =>
            workspace.registerOccurrenceMutation.mutate({
              documentId,
              note: occurrence.note,
              occurrenceTypeId: occurrence.occurrenceTypeId,
              productCode: occurrence.productCode,
              tripId: document.tripId,
            })
          }
          products={workspace.documentProductsQuery.data ?? []}
          types={workspace.occurrenceTypesQuery.data ?? []}
        />
      }
      products={workspace.documentProductsQuery.data ?? []}
      view={resolveDeliveryProofView({
        document,
        proofs: workspace.deliveryProofsQuery.data ?? [],
      })}
    />
  )
}
