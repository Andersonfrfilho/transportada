/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { Trip } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripCancelDialogProps = Readonly<{
  isCancelling: boolean
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  trips: readonly Trip[]
  vehicleLabelOf: (trip: Trip) => string
}>

/**
 * Spec 102 D5: a confirmação nomeia a consequência para a **carga**, não só a mudança de status.
 *
 * ⚠️ **Sem número de notas, de propósito.** O item da listagem não traz contagem, e buscá-la seriam
 * N requisições ao abrir o diálogo. O texto afirma o fato — a carga volta ao pool, o vínculo vira
 * histórico — sem afirmar uma quantidade que a tela não sabe.
 */
export function TripCancelDialog({
  isCancelling,
  isOpen,
  onClose,
  onConfirm,
  trips,
  vehicleLabelOf,
}: TripCancelDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })

  if (!isOpen) return null

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-cancel-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-cancel-title">{t('cancelDialog.title', { count: trips.length })}</h2>
            <p className={styles.mdfeGateSubtitle}>{t('cancelDialog.subtitle')}</p>
          </div>
          <button
            aria-label={t('cancelDialog.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <ul className={styles.mdfeGateList}>
          {trips.map((trip) => (
            <li className={styles.mdfeGateListItem} key={trip.id}>
              {vehicleLabelOf(trip)}
              {' · '}
              {t(`status.${trip.status}`)}
            </li>
          ))}
        </ul>

        {/* ⚠️ Irreversível para o vínculo: cancelar por engano não devolve a nota à viagem. */}
        <p className={styles.hint} role="status">
          {t('cancelDialog.irreversible')}
        </p>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} type="button" variant="ghost">
            <Icon name="close" />
            {t('cancelDialog.keep')}
          </Button>
          <Button disabled={isCancelling} onClick={onConfirm} type="button">
            <Icon name="remove" />
            {isCancelling ? t('cancelDialog.cancelling') : t('cancelDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
