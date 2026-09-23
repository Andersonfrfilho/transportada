/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { countDocumentsWithOpenOccurrence } from '../shared/occurrenceMarker.service'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import type { TripDetail, TripFiscalReadiness } from '../shared/trip.types'
import { TripReasonDialog } from './TripReasonDialog.component'
import styles from '../styles/trip.module.css'

const NOT_LOADED_STATUSES = new Set(['pending', 'separated'])

export type TripHeaderActionsProps = Readonly<{
  canManage: boolean
  /** Spec 170 RF2: o que barra o próximo passo, resumido ao lado de quem libera. */
  fiscalReadiness: TripFiscalReadiness | undefined
  isCancelPending: boolean
  isDispatchPending: boolean
  isPlanRoutePending: boolean
  onCancel: () => void
  onDispatch: (input: { readonly force: boolean; readonly forceReason?: string }) => void
  onPlanRoute: () => void
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
  fiscalReadiness,
  isCancelPending,
  isDispatchPending,
  isPlanRoutePending,
  onCancel,
  onDispatch,
  onPlanRoute,
  trip,
}: TripHeaderActionsProps) {
  const { t } = useTranslation('trip')
  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false)

  if (!canManage) return null

  const unloadedDocuments = trip.documents.filter(
    (document) =>
      document.releasedAt === null && NOT_LOADED_STATUSES.has(document.separationStatus),
  )
  const canPlanRoute = trip.status === 'draft'
  const canDispatch = ['loading', 'route_planned', 'separating'].includes(trip.status)
  const canCancel = trip.status !== 'completed' && trip.status !== 'cancelled'

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
    fiscalReadiness === undefined || fiscalReadiness.totalCount === 0
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
  const openOccurrences = countDocumentsWithOpenOccurrence(trip.documents)

  if (
    !canPlanRoute &&
    !canDispatch &&
    !canCancel &&
    readinessSummary === null &&
    openOccurrences === 0
  ) {
    return null
  }

  return (
    <div className={styles.headerActions}>
      {openOccurrences === 0 ? null : (
        <span className={styles.openOccurrenceBadge}>
          <Icon name="alert" size="sm" />
          {t('stops.openOccurrence', { count: openOccurrences })}
        </span>
      )}
      {readinessSummary === null ? null : <span className={styles.hint}>{readinessSummary}</span>}
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
    </div>
  )
}
