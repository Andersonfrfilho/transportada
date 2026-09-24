/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { FieldDeliveryController } from '../hooks/useFieldDelivery.hook'
import type { CanhotoTripDocument } from '../shared/canhotoIdentification.service'
import {
  collectFieldDeliveryDrafts,
  createInitialFieldDeliveryWizardState,
  currentFieldDeliveryDocument,
  fieldDeliveryWizardReducer,
  isFieldDeliveryWizardFinished,
  type FieldDeliveryWizardDocument,
} from '../shared/fieldDeliveryWizard.service'
import { focusFieldDeliveryStep } from '../shared/fieldDeliveryWizardFocus.service'
import { TripConfirmDialog } from './TripConfirmDialog.component'
import { FieldDeliveryBlockedStep } from './FieldDeliveryBlockedStep.component'
import { FieldDeliveryCaptureStep } from './FieldDeliveryCaptureStep.component'
import { FieldDeliveryFinishedStep } from './FieldDeliveryFinishedStep.component'
import { FieldDeliveryReviewStep } from './FieldDeliveryReviewStep.component'
import { FieldDeliverySendStep } from './FieldDeliverySendStep.component'
import { FieldDeliveryWizardHeader } from './FieldDeliveryWizardHeader.component'
import styles from '../styles/fieldDeliveryWizard.module.css'

export type FieldDeliveryWizardProps = Readonly<{
  /** M13c: `false` enquanto a chave de acesso das notas não chegou (consulta pendente/erro). */
  accessKeyDataAvailable?: boolean
  /** Spec 156 T14, ADR-0069 §6: interruptor da empresa — erro na leitura dele cai em `false` (R8). */
  canhotoOcrEnabled: boolean
  /**
   * Spec 156 T8b/T12: o motorista já escolhido no painel da viagem (`officeDriverId`) — o mesmo
   * seletor único que `FieldOccurrenceDialog` usa. O assistente só pré-preenche com ele; ainda dá
   * para trocar aqui dentro, porque um lote pode precisar de outro motorista da tripulação.
   */
  defaultDriverId: string
  dispatchedAt: null | string
  documents: readonly FieldDeliveryWizardDocument[]
  drivers: readonly Readonly<{ driverId: string; driverName: string }>[]
  /** Spec 156 T12: quem envia de verdade — o assistente só chama `submit`/`retryFailed`. */
  fieldDelivery: FieldDeliveryController
  hasMultipleDrivers: boolean
  isOpen: boolean
  onClose: () => void
  tripDocuments: readonly CanhotoTripDocument[]
}>

const TITLE_ID = 'field-delivery-wizard-title'

/**
 * Spec 156 T11 (D5, D6, D8, D9; aceites 5, 6, 8, 9): o assistente de baixa com canhoto — um passo
 * por nota, com câmera, conferência, pular e voltar. Serve tanto a ação da linha (uma nota) quanto
 * a ação em massa da seleção (`documents` com o maço marcado); quem monta essa lista é o chamador.
 *
 * ⚠️ **O envio não é desta task.** `onSubmit` recebe a lista tipada de rascunhos prontos
 * (`FieldDeliveryDraft[]`, com a imagem já reduzida) e quem grava — com concorrência limitada e
 * repetição do que falhar — é a T12 (`useFieldDelivery`). Aqui o `onSubmit` só fecha o assistente.
 */
export function FieldDeliveryWizard({
  accessKeyDataAvailable,
  canhotoOcrEnabled,
  defaultDriverId,
  dispatchedAt,
  documents,
  drivers,
  fieldDelivery,
  hasMultipleDrivers,
  isOpen,
  onClose,
  tripDocuments,
}: FieldDeliveryWizardProps) {
  const { t } = useTranslation('trip')
  const [state, dispatch] = useReducer(fieldDeliveryWizardReducer, documents, (initialDocuments) =>
    createInitialFieldDeliveryWizardState(initialDocuments),
  )
  const [driverId, setDriverId] = useState(defaultDriverId)
  /**
   * O `key` do chamador (`TripDetail`) já remonta o assistente a cada lote novo — mas o efeito
   * cobre o caso de alguém reusar este componente sem essa `key` no futuro, mesmo padrão defensivo
   * do `FieldOccurrenceDialog` (T8b).
   */
  useEffect(() => {
    if (isOpen) setDriverId(defaultDriverId)
  }, [defaultDriverId, isOpen])
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false)
  const hasCaptures = Object.keys(state.drafts).length > 0
  /** Spec 156 T12: já existe um envio desta sessão — mostra o resultado em vez da lista a enviar. */
  const hasSubmitted = Object.keys(fieldDelivery.statusByDocumentId).length > 0

  function finishClose(): void {
    fieldDelivery.reset()
    onClose()
  }

  /**
   * Confirmação só quando fechar custa alguma coisa: envio em andamento (o pedido explícito da
   * T12), ou fotos tiradas que **ainda não foram enviadas**. Depois que o lote termina — sucesso,
   * já entregue ou falha —, os rascunhos já foram para a API (ou o usuário já viu o resultado e
   * pode tentar de novo); barrar o fechamento aqui de novo seria confirmar duas vezes a mesma
   * saída.
   */
  function requestClose(): void {
    if (fieldDelivery.isSubmitting || (hasCaptures && !hasSubmitted)) setIsCloseConfirmOpen(true)
    else finishClose()
  }

  /**
   * Achado de revisão (spec 182): revoga as URLs das fotos de carga só quando elas realmente saem
   * do estado — a nota foi confirmada (o reducer já apaga a entrada dela) ou uma foto foi removida
   * (a entrada encolhe). Comparar com a rodada anterior num único lugar evita espalhar
   * `revokeObjectURL` pelos vários pontos que mudam esse estado (confirmar, remover, pular).
   */
  const previousCargoPhotosByDocumentIdRef = useRef(state.cargoPhotosByDocumentId)
  useEffect(() => {
    const previous = previousCargoPhotosByDocumentIdRef.current
    const current = state.cargoPhotosByDocumentId
    for (const [documentId, previousPhotos] of Object.entries(previous)) {
      const currentIds = new Set((current[documentId] ?? []).map((photo) => photo.id))
      for (const photo of previousPhotos) {
        if (!currentIds.has(photo.id)) URL.revokeObjectURL(photo.previewUrl)
      }
    }
    previousCargoPhotosByDocumentIdRef.current = current
  }, [state.cargoPhotosByDocumentId])

  // Fechar o assistente com fotos de carga ainda não confirmadas não pode vazar os object URLs.
  useEffect(() => {
    return () => {
      for (const photos of Object.values(previousCargoPhotosByDocumentIdRef.current)) {
        for (const photo of photos) URL.revokeObjectURL(photo.previewUrl)
      }
    }
  }, [])

  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose: requestClose })
  const isFinished = isFieldDeliveryWizardFinished(state)
  /**
   * T16: a cada troca de passo o foco vai para a ação do passo (`FIELD_DELIVERY_FOCUS_ATTRIBUTE`).
   * O botão clicado desmonta com o passo; sem isto o foco caía no `<body>` e o Enter/Esc paravam.
   */
  const focusStepKey = `${String(state.currentIndex)}:${state.step.kind}:${String(hasSubmitted)}:${String(fieldDelivery.isSubmitting)}`
  useEffect(() => {
    if (!isOpen || isCloseConfirmOpen) return
    focusFieldDeliveryStep(dialogRef.current)
  }, [dialogRef, focusStepKey, isCloseConfirmOpen, isOpen])

  if (!isOpen) return null

  const currentDocument = currentFieldDeliveryDocument(state)
  const selectedDocumentIds = state.documents.map((document) => document.documentId)
  const driverIdInput = driverId === '' ? {} : { driverId }

  function renderBody(): ReactNode {
    if (isFinished) {
      if (hasSubmitted) {
        return (
          <FieldDeliverySendStep
            documents={state.documents}
            fieldDelivery={fieldDelivery}
            onRequestClose={requestClose}
          />
        )
      }
      return (
        <FieldDeliveryFinishedStep
          documents={state.documents}
          drafts={collectFieldDeliveryDrafts(state)}
          onSubmit={fieldDelivery.submit}
        />
      )
    }
    if (currentDocument === undefined) return null

    if (state.step.kind === 'blocked') {
      return (
        <FieldDeliveryBlockedStep
          document={currentDocument}
          onRetake={() => dispatch({ kind: 'retakeRequested' })}
          onSkip={() => dispatch({ kind: 'skipRequested' })}
          step={state.step}
          stepIndex={state.currentIndex}
          totalSteps={state.documents.length}
        />
      )
    }

    if (state.step.kind === 'reviewing') {
      return (
        <FieldDeliveryReviewStep
          capture={state.step.capture}
          cargoPhotos={state.cargoPhotosByDocumentId[currentDocument.documentId] ?? []}
          currentDocument={currentDocument}
          dispatchedAt={dispatchedAt}
          documents={state.documents}
          onCargoPhotosAdded={(photos) =>
            dispatch({ documentId: currentDocument.documentId, kind: 'cargoPhotosAdded', photos })
          }
          onConfirm={(draft) => dispatch({ draft, kind: 'confirmRequested' })}
          onRemoveCargoPhoto={(photoId) =>
            dispatch({ documentId: currentDocument.documentId, kind: 'cargoPhotoRemoved', photoId })
          }
          onRetake={() => dispatch({ kind: 'retakeRequested' })}
          {...driverIdInput}
        />
      )
    }

    return (
      <FieldDeliveryCaptureStep
        {...(accessKeyDataAvailable === undefined ? {} : { accessKeyDataAvailable })}
        canhotoOcrEnabled={canhotoOcrEnabled}
        document={currentDocument}
        onCapture={(capture) => dispatch({ capture, kind: 'photoCaptured' })}
        onSkip={() => dispatch({ kind: 'skipRequested' })}
        selectedDocumentIds={selectedDocumentIds}
        stepIndex={state.currentIndex}
        totalSteps={state.documents.length}
        tripDocuments={tripDocuments}
      />
    )
  }

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={TITLE_ID}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <FieldDeliveryWizardHeader
          driverId={driverId}
          drivers={drivers}
          /* O motorista vai em cada rascunho no "Confirmar": trocar depois do último passo não
             mudaria nada do que já foi conferido — o seletor sai de cena no resumo. */
          hasMultipleDrivers={hasMultipleDrivers && !isFinished}
          /* T16: no resumo, antes de enviar, "Voltar" desfaz um "Pular" sem querer. */
          hasPreviousStep={state.currentIndex > 0 && !hasSubmitted}
          onClose={requestClose}
          onDriverChange={setDriverId}
          onPreviousStep={() => dispatch({ kind: 'previousRequested' })}
          titleId={TITLE_ID}
        />

        {renderBody()}
      </div>

      <TripConfirmDialog
        confirmLabel={t('fieldDelivery.closeConfirm')}
        isOpen={isCloseConfirmOpen}
        isSubmitting={false}
        message={t(
          fieldDelivery.isSubmitting
            ? 'fieldDelivery.closeSendingMessage'
            : 'fieldDelivery.closeMessage',
        )}
        onCancel={() => setIsCloseConfirmOpen(false)}
        onConfirm={() => {
          setIsCloseConfirmOpen(false)
          finishClose()
        }}
        title={t('fieldDelivery.closeTitle')}
      />
    </div>,
    document.body,
  )
}
