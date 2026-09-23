/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { DriverReturnReason } from '@/modules/driver-trip/shared/driverTrip.types'

import type { TripDocumentSelectionController } from '../hooks/useTripDocumentSelection.hook'
import type { FieldActionCapabilities } from '../shared/tripFieldActions.service'
import {
  selectFieldActionableDocumentIds,
  selectFieldReturnableDocumentIds,
} from '../shared/tripFieldActions.service'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import type { TripDetail } from '../shared/trip.types'
import { TripReasonDialog } from './TripReasonDialog.component'
import { TripReturnReasonDialog } from './TripReturnReasonDialog.component'
import styles from '../styles/trip.module.css'

const NOT_LOADED_STATUSES = new Set(['pending', 'separated'])

export type TripStateActionsProps = Readonly<{
  canManage: boolean
  /** Spec 156 T9: pelo menos uma nota da seleção tem a capacidade `fieldOccurrence`. */
  canFieldOccurrenceBatch: boolean
  /** Spec 156 T11: pelo menos uma nota da seleção tem a capacidade `fieldDelivery`. */
  canFieldDeliveryBatch: boolean
  canSeparateOrLoad: boolean
  /** Spec 156 T8b: "Devolver" em massa mostra quando ao menos uma nota selecionada aceita `fieldReturn`. */
  capabilities: FieldActionCapabilities
  isBatchPending: boolean
  isBatchReturnPending: boolean
  isCancelPending: boolean
  isDispatchPending: boolean
  isPlanRoutePending: boolean
  onBatch: (input: { readonly action: 'load' | 'separate' }) => void
  onBatchReturn: (reason: DriverReturnReason) => void
  onCancel: () => void
  onDispatch: (input: { readonly force: boolean; readonly forceReason?: string }) => void
  /** Spec 156 T9/T15: abre `FieldOccurrenceDialog` só com as notas do maço que têm `fieldOccurrence`. */
  onOpenFieldOccurrenceBatch: (documentIds: readonly string[]) => void
  /** Spec 156 T11/T15: abre `FieldDeliveryWizard` só com as notas do maço que têm `fieldDelivery`. */
  onOpenFieldDeliveryBatch: (documentIds: readonly string[]) => void
  onPlanRoute: () => void
  selection: TripDocumentSelectionController
  /** O que da seleção ainda tem CT-e a emitir — resolvido em `cteSelection.service.ts`. */
  pendingCteSelection: readonly string[]
  isGeneratingCteBatch: boolean
  onGenerateCteSelection: (tripDocumentIds: readonly string[]) => void
  trip: TripDetail
}>

/** RF-6/P1/P2 (spec 056): ações da viagem — planejar rota, despachar (com o portão de `force` +
 * motivo listando as notas pendentes primeiro), cancelar, e as três transições de nota em lote
 * sobre o maço selecionado (T015). */
export function TripStateActions({
  canManage,
  canFieldDeliveryBatch,
  canFieldOccurrenceBatch,
  canSeparateOrLoad,
  capabilities,
  isBatchPending,
  isBatchReturnPending,
  isCancelPending,
  isDispatchPending,
  isPlanRoutePending,
  onBatch,
  onBatchReturn,
  onCancel,
  onDispatch,
  onOpenFieldDeliveryBatch,
  onOpenFieldOccurrenceBatch,
  onPlanRoute,
  selection,
  pendingCteSelection,
  isGeneratingCteBatch,
  onGenerateCteSelection,
  trip,
}: TripStateActionsProps) {
  const { t } = useTranslation('trip')
  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false)
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)

  if (!canManage) return null

  const unloadedDocuments = trip.documents.filter(
    (document) =>
      document.releasedAt === null && NOT_LOADED_STATUSES.has(document.separationStatus),
  )
  const hasSelection = selection.selectedIds.size > 0
  const canPlanRoute = trip.status === 'draft'
  const canDispatch = ['loading', 'route_planned', 'separating'].includes(trip.status)
  const canCancel = trip.status !== 'completed' && trip.status !== 'cancelled'
  /** Spec 156 T8b: notas selecionadas sem `fieldReturn` não são enviadas — nem oferecidas aqui. */
  const returnableSelection = selectFieldReturnableDocumentIds({
    capabilities,
    documentIds: [...selection.selectedIds],
  })
  const canReturnSelection = returnableSelection.length > 0
  /**
   * A4d (spec 156 T15): a baixa/ocorrência em massa enviam só as notas selecionadas com a
   * capacidade — a seleção inteira ia direto para a API sem esse filtro, e cada nota sem a
   * capacidade virava um 403/409 solto no lote. O aviso mostra quantas ficaram de fora.
   */
  const occurrenceSelection = selectFieldActionableDocumentIds({
    action: 'fieldOccurrence',
    capabilities,
    documentIds: [...selection.selectedIds],
  })
  const deliverySelection = selectFieldActionableDocumentIds({
    action: 'fieldDelivery',
    capabilities,
    documentIds: [...selection.selectedIds],
  })
  const excludedFromOccurrenceBatch = selection.selectedIds.size - occurrenceSelection.length
  const excludedFromDeliveryBatch = selection.selectedIds.size - deliverySelection.length

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

  function handleBatchReturn(reason: DriverReturnReason): void {
    setIsReturnDialogOpen(false)
    onBatchReturn(reason)
  }

  return (
    <div className={styles.actionForm}>
      <h3>{t('stateActions.title')}</h3>

      {hasSelection &&
      (canSeparateOrLoad ||
        canReturnSelection ||
        canFieldOccurrenceBatch ||
        canFieldDeliveryBatch ||
        pendingCteSelection.length > 0) ? (
        <div className={styles.actionActions}>
          {canSeparateOrLoad ? (
            <Button
              disabled={isBatchPending}
              onClick={() => onBatch({ action: 'separate' })}
              size="sm"
              type="button"
            >
              <Icon name="check" />
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
              <Icon name="truck" />
              {t('stateActions.batchLoad', { count: selection.selectedIds.size })}
            </Button>
          ) : null}
          {/* Emitir pela seleção: o botão só existe quando o que está marcado tem CT-e a emitir —
              oferecê-lo para nota já autorizada faria a API recusar o clique inteiro. */}
          {pendingCteSelection.length > 0 ? (
            <Button
              disabled={isGeneratingCteBatch}
              onClick={() => onGenerateCteSelection(pendingCteSelection)}
              size="sm"
              type="button"
            >
              <Icon name="send" />
              {t('stateActions.generateCteSelection', { count: pendingCteSelection.length })}
            </Button>
          ) : null}
          {canReturnSelection ? (
            <Button
              disabled={isBatchReturnPending}
              onClick={() => setIsReturnDialogOpen(true)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="arrow-up" />
              {t('stateActions.batchReturn', { count: returnableSelection.length })}
            </Button>
          ) : null}
          {canFieldOccurrenceBatch ? (
            <Button
              onClick={() => onOpenFieldOccurrenceBatch(occurrenceSelection)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="alert" />
              {t('stateActions.batchFieldOccurrence', { count: occurrenceSelection.length })}
            </Button>
          ) : null}
          {canFieldDeliveryBatch ? (
            <Button
              onClick={() => onOpenFieldDeliveryBatch(deliverySelection)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="camera" />
              {t('stateActions.batchFieldDelivery', { count: deliverySelection.length })}
            </Button>
          ) : null}
          {excludedFromOccurrenceBatch > 0 || excludedFromDeliveryBatch > 0 ? (
            <p className={styles.hint} role="status">
              {excludedFromOccurrenceBatch > 0
                ? t('stateActions.batchFieldOccurrenceExcluded', {
                    count: excludedFromOccurrenceBatch,
                  })
                : null}
              {excludedFromDeliveryBatch > 0
                ? t('stateActions.batchFieldDeliveryExcluded', { count: excludedFromDeliveryBatch })
                : null}
            </p>
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
          <Button
            disabled={isDispatchPending}
            onClick={handleDispatchClick}
            size="sm"
            type="button"
          >
            <Icon name="send" />
            {t('stateActions.dispatch')}
          </Button>
        ) : null}
        {/*
          Revisão de design (23/09): "Cancelar viagem" era `ghost` — lia como link — e ficava colada
          na ação principal, a um pixel de erro de distância. Agora ela é secundária, com o tom de
          alerta, e empurrada para a outra ponta da linha: a ação destrutiva não divide vizinhança
          com a que o operador clica todo dia.
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

      <TripReturnReasonDialog
        isOpen={isReturnDialogOpen}
        isSubmitting={isBatchReturnPending}
        onClose={() => setIsReturnDialogOpen(false)}
        onSubmit={handleBatchReturn}
        title={t('stateActions.returnTitle')}
      />
    </div>
  )
}
