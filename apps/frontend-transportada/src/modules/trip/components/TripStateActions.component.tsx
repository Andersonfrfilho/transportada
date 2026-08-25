/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { TripDocumentSelectionController } from '../hooks/useTripDocumentSelection.hook'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import type { TripDetail } from '../shared/trip.types'
import { TripReasonDialog } from './TripReasonDialog.component'
import styles from '../styles/trip.module.css'

const NOT_LOADED_STATUSES = new Set(['pending', 'separated'])

export type TripStateActionsProps = Readonly<{
  canManage: boolean
  canReturn: boolean
  canSeparateOrLoad: boolean
  isBatchPending: boolean
  isCancelPending: boolean
  isDispatchPending: boolean
  isPlanRoutePending: boolean
  onBatch: (input: { readonly action: 'load' | 'return' | 'separate'; readonly returnReason?: string }) => void
  onCancel: () => void
  onDispatch: (input: { readonly force: boolean; readonly forceReason?: string }) => void
  onPlanRoute: () => void
  selection: TripDocumentSelectionController
  trip: TripDetail
}>

/** RF-6/P1/P2 (spec 056): ações da viagem — planejar rota, despachar (com o portão de `force` +
 * motivo listando as notas pendentes primeiro), cancelar, e as três transições de nota em lote
 * sobre o maço selecionado (T015). */
export function TripStateActions({
  canManage,
  canReturn,
  canSeparateOrLoad,
  isBatchPending,
  isCancelPending,
  isDispatchPending,
  isPlanRoutePending,
  onBatch,
  onCancel,
  onDispatch,
  onPlanRoute,
  selection,
  trip,
}: TripStateActionsProps) {
  const { t } = useTranslation('trip')
  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false)
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)

  if (!canManage) return null

  const unloadedDocuments = trip.documents.filter(
    (document) => document.releasedAt === null && NOT_LOADED_STATUSES.has(document.separationStatus),
  )
  const hasSelection = selection.selectedIds.size > 0
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

  function handleBatchReturn(reason: string): void {
    setIsReturnDialogOpen(false)
    onBatch({ action: 'return', returnReason: reason })
  }

  return (
    <div className={styles.actionForm}>
      <h3>{t('stateActions.title')}</h3>

      {hasSelection && (canSeparateOrLoad || canReturn) ? (
        <div className={styles.actionActions}>
          {canSeparateOrLoad ? (
            <Button
              disabled={isBatchPending}
              onClick={() => onBatch({ action: 'separate' })}
              size="sm"
              type="button"
            >
              {t('stateActions.batchSeparate', { count: selection.selectedIds.size })}
            </Button>
          ) : null}
          {canSeparateOrLoad ? (
            <Button
              disabled={isBatchPending}
              onClick={() => onBatch({ action: 'load' })}
              size="sm"
              type="button"
            >
              {t('stateActions.batchLoad', { count: selection.selectedIds.size })}
            </Button>
          ) : null}
          {canReturn ? (
            <Button
              disabled={isBatchPending}
              onClick={() => setIsReturnDialogOpen(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t('stateActions.batchReturn', { count: selection.selectedIds.size })}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className={styles.actionActions}>
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
        {canCancel ? (
          <Button
            disabled={isCancelPending}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
            {t('stateActions.cancel')}
          </Button>
        ) : null}
      </div>

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

      <TripReasonDialog
        isOpen={isReturnDialogOpen}
        isSubmitting={isBatchPending}
        onClose={() => setIsReturnDialogOpen(false)}
        onSubmit={handleBatchReturn}
        reasonLabel={t('stateActions.returnReasonLabel')}
        submitLabel={t('stateActions.returnSubmit')}
        title={t('stateActions.returnTitle')}
      />
    </div>
  )
}
