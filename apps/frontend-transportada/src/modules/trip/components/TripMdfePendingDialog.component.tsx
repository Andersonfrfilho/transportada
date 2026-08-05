/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { TripDocumentDetail } from '../shared/trip.types'
import { tripDocumentLabel, tripFiscalStatusKey } from '../shared/tripDocument.service'
import styles from '../styles/trip.module.css'

type TripMdfePendingDialogProps = Readonly<{
  isOpen: boolean
  onClose: () => void
  onGoToCteEmission: () => void
  pendingDocuments: readonly TripDocumentDetail[]
}>

export function TripMdfePendingDialog({
  isOpen,
  onClose,
  onGoToCteEmission,
  pendingDocuments,
}: TripMdfePendingDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })

  if (!isOpen) return null

  // Fora de `document.body` o overlay herdaria o `transform` da transição de página como bloco
  // de contenção, mesmo desenho de `CteEmissionDialog` em nfe-workspace.
  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-mdfe-gate-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-mdfe-gate-title">{t('mdfeGate.title')}</h2>
            <p className={styles.mdfeGateSubtitle}>{t('mdfeGate.subtitle')}</p>
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

        <ul className={styles.mdfeGateList}>
          {pendingDocuments.map((document) => (
            <li className={styles.mdfeGateListItem} key={document.id}>
              <span>{tripDocumentLabel(document)}</span>
              <span>
                {t(tripFiscalStatusKey(document.fiscalStatus), {
                  defaultValue: document.fiscalStatus,
                })}
              </span>
            </li>
          ))}
        </ul>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button onClick={onGoToCteEmission} size="sm" type="button">
            <Icon name="link" />
            {t('mdfeGate.goToCteEmission')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
