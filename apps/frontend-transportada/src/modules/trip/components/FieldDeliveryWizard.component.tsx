/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useReducer, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CanhotoTripDocument } from '../shared/canhotoIdentification.service'
import {
  collectFieldDeliveryDrafts,
  createInitialFieldDeliveryWizardState,
  currentFieldDeliveryDocument,
  fieldDeliveryWizardReducer,
  isFieldDeliveryWizardFinished,
  type FieldDeliveryDraft,
  type FieldDeliveryWizardDocument,
} from '../shared/fieldDeliveryWizard.service'
import { TripConfirmDialog } from './TripConfirmDialog.component'
import { FieldDeliveryCaptureStep } from './FieldDeliveryCaptureStep.component'
import { FieldDeliveryFinishedStep } from './FieldDeliveryFinishedStep.component'
import { FieldDeliveryReviewStep } from './FieldDeliveryReviewStep.component'
import { FieldDeliveryWizardHeader } from './FieldDeliveryWizardHeader.component'
import styles from '../styles/fieldDeliveryWizard.module.css'

export type FieldDeliveryWizardProps = Readonly<{
  dispatchedAt: null | string
  documents: readonly FieldDeliveryWizardDocument[]
  drivers: readonly Readonly<{ driverId: string; driverName: string }>[]
  hasMultipleDrivers: boolean
  isOpen: boolean
  onClose: () => void
  onSubmit: (drafts: readonly FieldDeliveryDraft[]) => void
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
  dispatchedAt,
  documents,
  drivers,
  hasMultipleDrivers,
  isOpen,
  onClose,
  onSubmit,
  tripDocuments,
}: FieldDeliveryWizardProps) {
  const { t } = useTranslation('trip')
  const [state, dispatch] = useReducer(fieldDeliveryWizardReducer, documents, (initialDocuments) =>
    createInitialFieldDeliveryWizardState(initialDocuments),
  )
  const [driverId, setDriverId] = useState('')
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false)
  const hasCaptures = Object.keys(state.drafts).length > 0

  function requestClose(): void {
    if (hasCaptures) setIsCloseConfirmOpen(true)
    else onClose()
  }

  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose: requestClose })

  if (!isOpen) return null

  const currentDocument = currentFieldDeliveryDocument(state)
  const selectedDocumentIds = state.documents.map((document) => document.documentId)
  const driverIdInput = driverId === '' ? {} : { driverId }
  const isFinished = isFieldDeliveryWizardFinished(state)

  function renderBody(): ReactNode {
    if (isFinished) {
      return (
        <FieldDeliveryFinishedStep
          documents={state.documents}
          drafts={collectFieldDeliveryDrafts(state)}
          onSubmit={onSubmit}
        />
      )
    }
    if (currentDocument === undefined) return null

    if (state.step.kind === 'blocked') {
      const { identification } = state.step
      const message =
        identification.status === 'notOnTrip'
          ? t('fieldDelivery.blockedNotOnTrip', { document: identification.documentLabel })
          : t('fieldDelivery.blockedOnTripNotSelected')
      return (
        <>
          <p className={styles.notice} role="alert">
            {message}
          </p>
          <div className={styles.captureActions}>
            <Button onClick={() => dispatch({ kind: 'retakeRequested' })} type="button">
              <Icon name="camera" />
              {t('fieldDelivery.retake')}
            </Button>
          </div>
        </>
      )
    }

    if (state.step.kind === 'reviewing') {
      return (
        <FieldDeliveryReviewStep
          capture={state.step.capture}
          currentDocument={currentDocument}
          dispatchedAt={dispatchedAt}
          documents={state.documents}
          onConfirm={(draft) => dispatch({ draft, kind: 'confirmRequested' })}
          onRetake={() => dispatch({ kind: 'retakeRequested' })}
          {...driverIdInput}
        />
      )
    }

    return (
      <FieldDeliveryCaptureStep
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
          hasMultipleDrivers={hasMultipleDrivers}
          hasPreviousStep={state.currentIndex > 0 && !isFinished}
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
        message={t('fieldDelivery.closeMessage')}
        onCancel={() => setIsCloseConfirmOpen(false)}
        onConfirm={() => {
          setIsCloseConfirmOpen(false)
          onClose()
        }}
        title={t('fieldDelivery.closeTitle')}
      />
    </div>,
    document.body,
  )
}
