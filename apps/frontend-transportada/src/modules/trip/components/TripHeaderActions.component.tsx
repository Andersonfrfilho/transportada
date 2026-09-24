/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import { hasOpenOccurrenceMarker } from '../shared/occurrenceMarker.service'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import { canOfferTripFieldAction, hasMultipleDrivers } from '../shared/tripFieldActions.service'
import type { FieldActionCapabilities } from '../shared/tripFieldActions.service'
import type { TripDetail, TripFiscalReadiness } from '../shared/trip.types'
import { TripConfirmDialog } from './TripConfirmDialog.component'
import { TripReasonDialog } from './TripReasonDialog.component'
import styles from '../styles/trip.module.css'

const NOT_LOADED_STATUSES = new Set(['pending', 'separated'])

export type TripHeaderActionsProps = Readonly<{
  canManage: boolean
  /**
   * Spec 180: "conferir carga"/"iniciar rota" vieram de `TripFieldActions` — mesmo gate de lá
   * (`trip.report-on-behalf`), agora hospedado no bloco de ações da viagem.
   */
  canReportOnBehalf: boolean
  capabilities: FieldActionCapabilities
  /** Spec 170 RF2: o que barra o próximo passo, resumido ao lado de quem libera. */
  fiscalReadiness: TripFiscalReadiness | undefined
  isCancelPending: boolean
  isConfirmLoadPending: boolean
  isDispatchPending: boolean
  /**
   * Se o painel "Prontidão fiscal" está na página para o resumo apontar. Sem `fleet.read`
   * (spec 156 D11) o painel some da tela, e um link para lá seria um link que não leva a nada.
   */
  isFiscalReadinessPanelVisible: boolean
  isPlanRoutePending: boolean
  isStartRoutePending: boolean
  onCancel: () => void
  onConfirmLoad: () => void
  onDispatch: (input: { readonly force: boolean; readonly forceReason?: string }) => void
  /** A nota é a mesma que o selo da linha abre — o resumo do cabeçalho leva direto ao diálogo dela. */
  onOpenOccurrenceDocument: (documentId: string) => void
  onPlanRoute: () => void
  /**
   * Spec 156 T8b: mesmo seletor que `TripFieldActions` já usava — só aparece com mais de um
   * motorista (`hasMultipleDrivers`), e vale para "conferir carga"/"iniciar rota" aqui.
   */
  onSelectDriverId: (driverId: string) => void
  onStartRoute: () => void
  selectedDriverId: string
  trip: TripDetail
}>

/**
 * Spec 170: as ações de **estado** da viagem, no cabeçalho, junto do status.
 *
 * Elas viviam numa seção no meio da página, depois do progresso, da ocupação e do mapa — e a
 * prontidão fiscal, que diz o que barra o próximo passo, morava num terceiro bloco ainda mais
 * abaixo. Era a mesma decisão partida em três lugares, e quem abria a tela para decidir rolava
 * para achar o botão.
 *
 * ⚠️ **Só o estado da viagem mora aqui.** As ações sobre o maço selecionado continuam em
 * `TripStateActions`: elas pertencem à seleção, não à viagem, e subir as duas juntas trocaria um
 * problema de ordem por outro (é o que a spec 079 T021 registrou ao descer os botões do topo).
 */
export function TripHeaderActions({
  canManage,
  canReportOnBehalf,
  capabilities,
  fiscalReadiness,
  isCancelPending,
  isConfirmLoadPending,
  isDispatchPending,
  isFiscalReadinessPanelVisible,
  isPlanRoutePending,
  isStartRoutePending,
  onCancel,
  onConfirmLoad,
  onDispatch,
  onOpenOccurrenceDocument,
  onPlanRoute,
  onSelectDriverId,
  onStartRoute,
  selectedDriverId,
  trip,
}: TripHeaderActionsProps) {
  const { t } = useTranslation('trip')
  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false)
  const [isStartRouteDialogOpen, setIsStartRouteDialogOpen] = useState(false)

  const canConfirmLoad = canOfferTripFieldAction({
    action: 'confirmLoad',
    canReportOnBehalf,
    capabilities,
  })
  const canStartRoute = canOfferTripFieldAction({
    action: 'startRoute',
    canReportOnBehalf,
    capabilities,
  })

  if (!canManage && !canConfirmLoad && !canStartRoute) return null

  const unloadedDocuments = canManage
    ? trip.documents.filter(
        (document) =>
          document.releasedAt === null && NOT_LOADED_STATUSES.has(document.separationStatus),
      )
    : []
  const canPlanRoute = canManage && trip.status === 'draft'
  const canDispatch =
    canManage && ['loading', 'route_planned', 'separating'].includes(trip.status)
  const canCancel = canManage && trip.status !== 'completed' && trip.status !== 'cancelled'

  function handleDispatchClick(): void {
    if (unloadedDocuments.length > 0) {
      setIsDispatchDialogOpen(true)
      return
    }
    onDispatch({ force: false })
  }

  function handleForceDispatch(reason: string): void {
    setIsDispatchDialogOpen(false)
    onDispatch({ force: true, forceReason: reason })
  }

  /**
   * O resumo só aparece quando há nota a preparar. Viagem sem nota não tem prontidão a informar, e
   * uma linha dizendo "0 de 0" seria ruído no lugar mais nobre da tela.
   *
   * RF8/CA07 (spec 175): `readyCount`/`totalCount` respondem só pelo CT-e — a nota que espera NFS-e
   * entra no `total`, mas nunca no `ready`, porque não há como saber aqui se ela já foi emitida.
   * Sem citar `fiscalReadiness.nfseCount`, "3 de 3" leria como viagem pronta mesmo com nota de NFS-e
   * ainda pendente ao lado.
   */
  const readinessSummary =
    !canManage || fiscalReadiness === undefined || fiscalReadiness.totalCount === 0
      ? null
      : fiscalReadiness.nfseCount === 0
        ? t('stateActions.readinessSummary', {
            ready: fiscalReadiness.readyCount,
            total: fiscalReadiness.totalCount,
          })
        : t('stateActions.readinessSummaryWithNfse', {
            nfsePending: fiscalReadiness.nfseCount,
            ready: fiscalReadiness.readyCount,
            total: fiscalReadiness.totalCount,
          })

  /**
   * Spec 173 RF6: quantas notas da viagem têm tratativa aberta. Zero não vira linha — o cabeçalho é
   * o lugar mais nobre da tela, e "0 notas com ocorrência" ocuparia espaço para não dizer nada.
   */
  const openOccurrenceDocuments = canManage ? trip.documents.filter(hasOpenOccurrenceMarker) : []
  const openOccurrences = openOccurrenceDocuments.length
  const firstOpenOccurrenceDocument = openOccurrenceDocuments[0]
  /**
   * O texto vira link para a única ação que o resolve. Com uma nota só, é o diálogo dela — a mesma
   * que o selo da linha abre; com mais de uma, a rolagem para a lista onde os selos aparecem. O
   * mesmo `t('stops.openOccurrence')` de antes: o resumo ganha ação sem trocar de texto.
   */
  const readinessHasGap =
    fiscalReadiness !== undefined && fiscalReadiness.readyCount < fiscalReadiness.totalCount

  if (
    !canPlanRoute &&
    !canDispatch &&
    !canCancel &&
    !canConfirmLoad &&
    !canStartRoute &&
    readinessSummary === null &&
    openOccurrences === 0
  ) {
    return null
  }

  return (
    <div className={styles.headerActions}>
      {openOccurrences === 0 ? null : openOccurrences === 1 &&
        firstOpenOccurrenceDocument !== undefined ? (
        <Button
          className={styles.openOccurrenceBadge}
          onClick={() => onOpenOccurrenceDocument(firstOpenOccurrenceDocument.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="alert" size="sm" />
          {t('stops.openOccurrence', { count: openOccurrences })}
        </Button>
      ) : (
        <Button asChild className={styles.openOccurrenceBadge} size="sm" variant="ghost">
          <a href="#trip-stops-title">
            <Icon name="alert" size="sm" />
            {t('stops.openOccurrence', { count: openOccurrences })}
          </a>
        </Button>
      )}
      {readinessSummary === null ? null : readinessHasGap && isFiscalReadinessPanelVisible ? (
        <Button asChild className={styles.hint} size="sm" variant="ghost">
          <a href="#trip-fiscal-readiness-title">
            {readinessSummary}
            <Icon name="chevron-right" size="sm" />
          </a>
        </Button>
      ) : (
        <span className={styles.hint}>{readinessSummary}</span>
      )}
      {canPlanRoute ? (
        <Button disabled={isPlanRoutePending} onClick={onPlanRoute} size="sm" type="button">
          <Icon name="sort" />
          {t('stateActions.planRoute')}
        </Button>
      ) : null}
      {canDispatch ? (
        <Button disabled={isDispatchPending} onClick={handleDispatchClick} size="sm" type="button">
          <Icon name="send" />
          {t('stateActions.dispatch')}
        </Button>
      ) : null}
      {/*
       * Spec 180: "conferir carga"/"iniciar rota" vieram de `TripFieldActions` — o painel existia só
       * para elas. O seletor de motorista é o mesmo de lá, só aparece com mais de um na viagem.
       */}
      {(canConfirmLoad || canStartRoute) && hasMultipleDrivers(trip.drivers) ? (
        <label className={styles.hint}>
          {t('fieldActions.driverLabel')}
          <Select
            ariaLabel={t('fieldActions.driverLabel')}
            onChange={onSelectDriverId}
            options={trip.drivers.map((driver) => ({
              label: driver.driverName,
              value: driver.driverId,
            }))}
            value={selectedDriverId}
          />
        </label>
      ) : null}
      {canConfirmLoad ? (
        <Button disabled={isConfirmLoadPending} onClick={onConfirmLoad} size="sm" type="button">
          <Icon name="check" />
          {t('fieldActions.confirmLoad')}
        </Button>
      ) : null}
      {canStartRoute ? (
        <Button
          disabled={isStartRoutePending}
          onClick={() => setIsStartRouteDialogOpen(true)}
          size="sm"
          type="button"
        >
          <Icon name="send" />
          {t('fieldActions.startRoute')}
        </Button>
      ) : null}
      {/*
        A destrutiva é a última e usa o tom de alerta (revisão de design de 23/09): ela não divide
        vizinhança com a ação de todo dia, e não lê como link, que era o que o `ghost` fazia.
      */}
      {canCancel ? (
        <Button
          className={styles.actionDestructive}
          disabled={isCancelPending}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="close" />
          {t('stateActions.cancel')}
        </Button>
      ) : null}

      <TripReasonDialog
        isOpen={isDispatchDialogOpen}
        isSubmitting={isDispatchPending}
        items={unloadedDocuments.map((document) => tripDocumentLabel(document))}
        onClose={() => setIsDispatchDialogOpen(false)}
        onSubmit={handleForceDispatch}
        reasonLabel={t('stateActions.forceReasonLabel')}
        subtitle={t('stateActions.forceSubtitle')}
        submitLabel={t('stateActions.forceSubmit')}
        title={t('stateActions.forceTitle')}
      />

      <TripConfirmDialog
        confirmLabel={t('fieldActions.startRouteConfirm')}
        isOpen={isStartRouteDialogOpen}
        isSubmitting={isStartRoutePending}
        message={t('fieldActions.startRouteMessage')}
        onCancel={() => setIsStartRouteDialogOpen(false)}
        onConfirm={() => {
          setIsStartRouteDialogOpen(false)
          onStartRoute()
        }}
        title={t('fieldActions.startRouteTitle')}
      />
    </div>
  )
}
