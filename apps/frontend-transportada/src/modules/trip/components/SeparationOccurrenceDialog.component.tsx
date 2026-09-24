/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { TripOccurrences } from './TripOccurrences.component'
import type { OccurrencePhoto } from './OccurrencePhotoPicker.component'
import { tripDocumentLabel } from '../shared/tripDocument.service'
import type { OccurrenceType } from '../shared/occurrence.constant'
import type { OccurrenceQuantityUnit } from '../shared/trip.constant'
import type { OccurrencePhotoSendItem } from '../shared/occurrencePhotoSend.service'
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
  onReset: () => void
  onRegister: (input: {
    readonly note: string
    readonly occurrenceTypeId: string
    readonly photos: readonly OccurrencePhoto[]
    /** Lista vazia é a nota inteira — não existe código sentinela para ela. */
    readonly productCodes: readonly string[]
    /** Spec 166 RF4/RF7: alinhadas por índice a `productCodes`. `null` é item sem contagem. */
    readonly productQuantities: readonly (null | string)[]
    readonly productQuantityUnits: readonly (null | OccurrenceQuantityUnit)[]
  }) => Promise<Readonly<{ hasFailure: boolean }>>
  photoSendState: readonly OccurrencePhotoSendItem[]
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
  onReset,
  photoSendState,
  products,
  types,
}: SeparationOccurrenceDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  /**
   * Revisão de UX (spec 161): `TripOccurrences` guarda o rascunho (foto/observação) e é quem sabe
   * se há algo a perder — reporta aqui por `onDirtyChange` para o X do cabeçalho (que não tem
   * acesso a esse estado) também confirmar antes de descartar até cinco fotos.
   */
  const [isDirty, setIsDirty] = useState(false)
  const [isConfirmingClose, setIsConfirmingClose] = useState(false)

  if (!isOpen) return null

  function discardAndClose(): void {
    setIsConfirmingClose(false)
    onReset()
    onClose()
  }

  function handleCloseClick(): void {
    if (isDirty) {
      setIsConfirmingClose(true)
      return
    }
    discardAndClose()
  }

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
          {/*
           * Revisão de UX (spec 161): título fixo, curto, nunca quebra — a nota (que é o dado
           * variável e o que a pessoa veio conferir) vai numa segunda linha que quebra por
           * `overflow-wrap`, em vez de truncar atrás de reticências ou depender de `title=`
           * nativo (proibido pelo design system, `docs/frontend/tooltips.md`).
           */}
          <div className={styles.occurrenceDialogTitleWrap}>
            <h2 id="separation-occurrence-title">{t('occurrence.dialogTitleFixed')}</h2>
            <p className={styles.occurrenceDialogSubtitle}>{tripDocumentLabel(tripDocument)}</p>
          </div>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={handleCloseClick}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {/*
         * Revisão de UX (spec 161): o X e o Cancelar descartavam até cinco fotos sem perguntar —
         * mesmo bloco de confirmação em duas etapas do `WhatsAppPhonePanel` (`isConfirmingUnlink`),
         * já com o teste de acessibilidade (`role="alertdialog"`) resolvido ali.
         */}
        {isConfirmingClose ? (
          <div className={styles.occurrenceDiscardConfirm} role="alertdialog">
            <p>{t('occurrence.closeConfirmBody')}</p>
            <Button
              onClick={() => setIsConfirmingClose(false)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
              {t('occurrence.closeConfirmContinue')}
            </Button>
            <Button onClick={discardAndClose} size="sm" type="button" variant="secondary">
              <Icon name="trash" />
              {t('occurrence.closeConfirmDiscard')}
            </Button>
          </div>
        ) : null}

        <TripOccurrences
          canRegister={canRegister}
          email={email}
          isDialog
          isRegistering={isRegistering}
          occurrences={occurrences}
          onDirtyChange={setIsDirty}
          onRegister={onRegister}
          onReset={onReset}
          photoSendState={photoSendState}
          products={products}
          types={types}
        />
      </div>
    </div>,
    document.body,
  )
}
