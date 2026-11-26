/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5c (D9): confirmação do "Mover para a NF X". Motivo só da lista fechada (sem texto
 * livre) e a frase de que mover **não aprova**: a foto chega na NF certa aguardando conferência.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  CANHOTO_MOVE_ERROR_KEYS,
  CANHOTO_MOVE_FALLBACK_ERROR_KEY,
  CANHOTO_MOVE_REASONS,
  isCanhotoMoveReason,
  type CanhotoMoveReason,
  type CanhotoMoveTarget,
} from '../shared/canhotoMove.service'
import styles from '../styles/trip.module.css'

const TITLE_ID = 'canhoto-move-dialog-title'

type CanhotoMoveDialogProps = Readonly<{
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (reason: CanhotoMoveReason) => void
  serverErrorCode?: string
  target: CanhotoMoveTarget
}>

/** Montado só enquanto aberto: cada abertura começa do motivo padrão. */
export function CanhotoMoveDialog({
  isSubmitting,
  onClose,
  onSubmit,
  serverErrorCode,
  target,
}: CanhotoMoveDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const [reason, setReason] = useState<CanhotoMoveReason>(CANHOTO_MOVE_REASONS[0])
  useEffect(() => setReason(CANHOTO_MOVE_REASONS[0]), [target.targetDocumentId])

  const errorKey =
    serverErrorCode === undefined
      ? undefined
      : (CANHOTO_MOVE_ERROR_KEYS[serverErrorCode] ?? CANHOTO_MOVE_FALLBACK_ERROR_KEY)
  const values = { number: target.number, series: target.series }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={TITLE_ID}
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id={TITLE_ID}>{t('deliveryProof.canhotoMove.title', values)}</h2>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className={styles.hint}>{t('deliveryProof.canhotoMove.description', values)}</p>

        <label>
          {t('deliveryProof.canhotoMove.reasonLabel')}
          <Select
            ariaLabel={t('deliveryProof.canhotoMove.reasonLabel')}
            onChange={(value) => {
              if (isCanhotoMoveReason(value)) setReason(value)
            }}
            options={CANHOTO_MOVE_REASONS.map((option) => ({
              label: t(`deliveryProof.canhotoMove.reason.${option}`),
              value: option,
            }))}
            value={reason}
          />
        </label>

        {errorKey === undefined ? null : (
          <p className={styles.alert} role="alert">
            {t(`deliveryProof.canhotoMove.error.${errorKey}`, values)}
          </p>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('deliveryProof.canhotoMove.cancel')}
          </Button>
          <Button disabled={isSubmitting} onClick={() => onSubmit(reason)} size="sm" type="button">
            <Icon name="send" />
            {t('deliveryProof.canhotoMove.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
