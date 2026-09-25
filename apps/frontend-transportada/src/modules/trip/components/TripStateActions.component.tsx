/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button, buttonClassName } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { NfseEmissionAction } from '@/modules/nfse-invoice/components/NfseEmissionAction.component'

import type { TripDocumentSelectionController } from '../hooks/useTripDocumentSelection.hook'
import type { FieldActionCapabilities } from '../shared/tripFieldActions.service'
import type { DriverReturnReason } from '../shared/tripReturnReason.types'
import {
  selectFieldActionableDocumentIds,
  selectFieldReturnableDocumentIds,
} from '../shared/tripFieldActions.service'
import { TripReturnReasonDialog } from './TripReturnReasonDialog.component'
import styles from '../styles/trip.module.css'

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
  /** O que da seleção ainda aceita carregar — resolvido em `batchTransitionSelection.service.ts`. */
  loadableSelection: readonly string[]
  isBatchReturnPending: boolean
  onBatch: (input: { readonly action: 'load' | 'separate' }) => void
  onBatchReturn: (reason: DriverReturnReason) => void
  /** Spec 156 T9/T15: abre `FieldOccurrenceDialog` só com as notas do maço que têm `fieldOccurrence`. */
  onOpenFieldOccurrenceBatch: (documentIds: readonly string[]) => void
  /** Spec 156 T11/T15: abre `FieldDeliveryWizard` só com as notas do maço que têm `fieldDelivery`. */
  onOpenFieldDeliveryBatch: (documentIds: readonly string[]) => void
  selection: TripDocumentSelectionController
  /** O que da seleção ainda aceita separar — mesma origem de `loadableSelection`. */
  separableSelection: readonly string[]
  /** O que da seleção ainda tem CT-e a emitir — resolvido em `cteSelection.service.ts`. */
  pendingCteSelection: readonly string[]
  isGeneratingCteBatch: boolean
  onGenerateCteSelection: (tripDocumentIds: readonly string[]) => void
  /**
   * O que da seleção espera NFS-e, em ids de **nota**. Marcar notas dos dois tipos oferece as duas
   * ações: uma seleção mista não é motivo para esconder metade do que dá para fazer com ela.
   */
  pendingNfseSelection: readonly string[]
  companyId: string | undefined
  permissions: readonly string[]
  onNfseEmitted: () => void
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
  loadableSelection,
  onBatch,
  onBatchReturn,
  onOpenFieldDeliveryBatch,
  onOpenFieldOccurrenceBatch,
  selection,
  separableSelection,
  pendingCteSelection,
  isGeneratingCteBatch,
  onGenerateCteSelection,
  pendingNfseSelection,
  companyId,
  permissions,
  onNfseEmitted,
}: TripStateActionsProps) {
  const { t } = useTranslation('trip')
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false)

  if (!canManage) return null

  const hasSelection = selection.selectedIds.size > 0
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
  /**
   * A exclusão só se conta quando a ação está sendo oferecida. Sem isto a tela avisava que notas
   * ficaram de fora de um botão que ela não mostra, com o número da seleção inteira.
   */
  const excludedFromOccurrenceBatch = canFieldOccurrenceBatch
    ? selection.selectedIds.size - occurrenceSelection.length
    : 0
  const excludedFromDeliveryBatch = canFieldDeliveryBatch
    ? selection.selectedIds.size - deliverySelection.length
    : 0

  function handleBatchReturn(reason: DriverReturnReason): void {
    setIsReturnDialogOpen(false)
    onBatchReturn(reason)
  }

  return (
    <div className={styles.actionForm}>
      <h3>{t('stateActions.title')}</h3>

      {hasSelection &&
      ((canSeparateOrLoad && (separableSelection.length > 0 || loadableSelection.length > 0)) ||
        canReturnSelection ||
        canFieldOccurrenceBatch ||
        canFieldDeliveryBatch ||
        pendingCteSelection.length > 0 ||
        pendingNfseSelection.length > 0) ? (
        <div className={styles.actionActions}>
          {canSeparateOrLoad && separableSelection.length > 0 ? (
            <Button
              disabled={isBatchPending}
              onClick={() => onBatch({ action: 'separate' })}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {t('stateActions.batchSeparate', { count: separableSelection.length })}
            </Button>
          ) : null}
          {canSeparateOrLoad && loadableSelection.length > 0 ? (
            <Button
              disabled={isBatchPending}
              onClick={() => onBatch({ action: 'load' })}
              size="sm"
              type="button"
            >
              <Icon name="truck" />
              {t('stateActions.batchLoad', { count: loadableSelection.length })}
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
          {/* A ação da NFS-e é do módulo dono: ela abre o diálogo com as notas marcadas e o perfil
              continua sendo escolha de quem emite. */}
          {pendingNfseSelection.length > 0 ? (
            <NfseEmissionAction
              className={buttonClassName({ size: 'sm' })}
              {...(companyId === undefined ? {} : { companyId })}
              documentIds={pendingNfseSelection}
              onEmitted={onNfseEmitted}
              permissions={permissions}
            />
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
