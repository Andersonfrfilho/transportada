/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { TripOccurrences } from './TripOccurrences.component'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import type { OccurrenceType } from '../shared/occurrence.constant'
import type { TripDocumentDetail, TripDocumentProduct, TripOccurrence } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

export type SeparationOccurrenceDialogProps = Readonly<{
  canRegister: boolean
  document: TripDocumentDetail
  email: null | Readonly<{ body: string; subject: string }>
  isOpen: boolean
  isRegistering: boolean
  occurrences: readonly TripOccurrence[]
  onClose: () => void
  onRegister: (input: {
    readonly note: string
    readonly occurrenceTypeId: string
    readonly productCode: string
  }) => void
  products: readonly TripDocumentProduct[]
  types: readonly OccurrenceType[]
}>

/**
 * Botão da linha da nota (`TripStopList`): registra ocorrência de galpão (`separation`) sem
 * precisar abrir o comprovante primeiro — que hoje é o único caminho até `TripOccurrences`, e no
 * galpão ninguém abre comprovante. Não duplica o formulário: só empresta a moldura de diálogo
 * (mesmo padrão de `FieldOccurrenceDialog`/`TripStopOccurrenceDialog`) em volta dele.
 */
export function SeparationOccurrenceDialog({
  canRegister,
  document: tripDocument,
  email,
  isOpen,
  isRegistering,
  occurrences,
  onClose,
  onRegister,
  products,
  types,
}: SeparationOccurrenceDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })

  if (!isOpen) return null

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="separation-occurrence-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id="separation-occurrence-title">
            {t('occurrence.dialogTitle', { document: tripDocumentLabel(tripDocument) })}
          </h2>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <TripOccurrences
          canRegister={canRegister}
          email={email}
          isRegistering={isRegistering}
          occurrences={occurrences}
          onRegister={onRegister}
          products={products}
          types={types}
        />
      </div>
    </div>,
    document.body,
  )
}
