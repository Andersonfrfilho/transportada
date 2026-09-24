/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/trip.module.css'

type TripCloseDialogProps = Readonly<{
  /** A recusa do servidor, já traduzida em chave de feedback. `null` enquanto nada falhou. */
  feedbackKey: null | string
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (reason: null | string) => void
  /** Spec 156 T8c: com nota em aberto o motivo é obrigatório; com todas fechadas, é opcional. */
  openDocumentCount: number
}>

/**
 * Spec 156 T8c (ADR-0067): confirma o encerramento e diz quantas notas ficarão sem baixa. Mesmo
 * molde visual de `TripReasonDialog`, com uma diferença: o motivo só é obrigatório quando há nota
 * em aberto — sem nenhuma, o campo fica livre para ficar em branco.
 */
export function TripCloseDialog({
  feedbackKey,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  openDocumentCount,
}: TripCloseDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const [reason, setReason] = useState('')
  const isReasonRequired = openDocumentCount > 0
  const trimmedReason = reason.trim()

  /**
   * Só a **abertura** limpa o campo — nunca o envio. Fechar cedo demais (achado do
   * code-reviewer) perdia o motivo digitado quando o servidor recusava: `onSubmit` só fecha o
   * diálogo depois do sucesso (`TripDetail.component.tsx`), e este efeito não dispara de novo
   * enquanto `isOpen` continua `true` — o texto sobrevive ao erro, junto do aviso da mutation.
   */
  useEffect(() => {
    if (isOpen) setReason('')
  }, [isOpen])

  if (!isOpen) return null

  function handleSubmit(): void {
    if (isReasonRequired && trimmedReason.length === 0) return
    onSubmit(trimmedReason.length === 0 ? null : trimmedReason)
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-close-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-close-dialog-title">{t('closeDialog.title')}</h2>
            <p className={styles.mdfeGateSubtitle}>
              {openDocumentCount > 0
                ? t('closeDialog.openDocumentsWarning', { count: openDocumentCount })
                : t('closeDialog.noOpenDocuments')}
            </p>
          </div>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {/* O aviso vive aqui dentro: o da página fica atrás do overlay enquanto o diálogo está aberto */}
        {feedbackKey === null ? null : (
          <p className={styles.alert} role="alert">
            {t(`feedback.${feedbackKey}`)}
          </p>
        )}

        <label>
          {isReasonRequired ? t('closeDialog.reasonLabel') : t('closeDialog.reasonLabelOptional')}
          <input
            autoComplete="off"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </label>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button
            disabled={(isReasonRequired && trimmedReason.length === 0) || isSubmitting}
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            <Icon name="power" />
            {t('closeDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
