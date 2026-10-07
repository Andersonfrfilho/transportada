/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useCargoOccurrenceForm } from '../hooks/useCargoOccurrenceForm.hook'
import type { OpenedOccurrenceForm } from '../hooks/useCargoOccurrence.hook'
import styles from '../styles/cargoOccurrence.module.css'
import dialogStyles from '../styles/cargoOccurrenceDialog.module.css'
import { CargoOccurrenceDialogFooter } from './CargoOccurrenceDialogFooter.component'
import { CargoOccurrenceDialogHeader } from './CargoOccurrenceDialogHeader.component'
import { CargoOccurrenceDialogFeedback } from './CargoOccurrenceDialogFeedback.component'
import { CargoOccurrenceItemsField } from './CargoOccurrenceItemsField.component'
import { CargoOccurrenceNoteField } from './CargoOccurrenceNoteField.component'
import { CargoOccurrencePhotoField } from './CargoOccurrencePhotoField.component'
import { CargoOccurrenceTypeField } from './CargoOccurrenceTypeField.component'

type CargoOccurrenceDialogProps = Readonly<{
  arrivalId: string
  note: OpenedOccurrenceForm
  onClose: () => void
}>

/**
 * A avaria na nota da chegada (RF8): tela cheia no celular, com tipo, itens e contagem, observação e foto. O
 * erro do servidor nomeia TODOS os campos com atalho (`web.md` §11) e o texto do código fica logo abaixo.
 */
export function CargoOccurrenceDialog({
  arrivalId,
  note,
  onClose,
}: CargoOccurrenceDialogProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const titleId = useId()
  const blockedReasonId = useId()
  const form = useCargoOccurrenceForm({ arrivalId, documentId: note.documentId, onSaved: onClose })

  function handleClose(): void {
    if (!form.isSubmitting) onClose()
  }

  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: handleClose })

  return createPortal(
    <div className={dialogStyles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={dialogStyles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <CargoOccurrenceDialogHeader
          isDisabled={form.isSubmitting}
          number={note.number}
          onClose={handleClose}
          titleId={titleId}
        />
        {form.isLoading ? (
          <SkeletonGroup label={t('occurrence.dialog.loading')}>
            <Skeleton height="3rem" />
            <Skeleton height="8rem" />
          </SkeletonGroup>
        ) : (
          <>
            <CargoOccurrenceTypeField form={form} />
            <CargoOccurrenceItemsField form={form} />
            <CargoOccurrenceNoteField form={form} />
            <CargoOccurrencePhotoField form={form} />
          </>
        )}
        <CargoOccurrenceDialogFeedback form={form} panelRef={dialogRef} />
        {form.hasNoTypes ? (
          <p className={styles.fieldError} data-submit-blocked="" id={blockedReasonId}>
            {t('occurrence.dialog.submitBlockedNoTypes')}
          </p>
        ) : null}
        <CargoOccurrenceDialogFooter
          blockedReasonId={form.hasNoTypes ? blockedReasonId : undefined}
          isLoading={form.isLoading}
          isSubmitting={form.isSubmitting}
          onCancel={handleClose}
          onSubmit={form.submit}
        />
      </div>
    </div>,
    document.body,
  )
}
