/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { Trip } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripCloseBulkDialogProps = Readonly<{
  /** A recusa do servidor, já traduzida em chave de feedback. `null` enquanto nada falhou. */
  feedbackKey: null | string
  isOpen: boolean
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
  trips: readonly Trip[]
  vehicleLabelOf: (trip: Trip) => string
}>

/**
 * Spec 223 RF8 (ADR-0091): encerra as viagens marcadas na lista, de uma vez.
 *
 * ⚠️ **O motivo é obrigatório aqui, ao contrário do diálogo do detalhe.** Lá a tela sabe quantas
 * notas estão em aberto e dispensa a justificativa quando não há nenhuma; a listagem não traz essa
 * contagem, e buscá-la seriam N requisições ao abrir o diálogo. Sem saber, o lado seguro é pedir o
 * motivo — é o mesmo que o servidor exigiria na pior das viagens marcadas.
 */
export function TripCloseBulkDialog({
  feedbackKey,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  trips,
  vehicleLabelOf,
}: TripCloseBulkDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()

  /** Só a abertura limpa o campo: o motivo digitado sobrevive à recusa do servidor. */
  useEffect(() => {
    if (isOpen) setReason('')
  }, [isOpen])

  if (!isOpen) return null

  function handleSubmit(): void {
    if (trimmedReason.length === 0) return
    onSubmit(trimmedReason)
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-close-bulk-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-close-bulk-title">
              {t('closeBulkDialog.title', { count: trips.length })}
            </h2>
            <p className={styles.mdfeGateSubtitle}>{t('closeBulkDialog.subtitle')}</p>
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
          {trips.map((trip) => (
            <li className={styles.mdfeGateListItem} key={trip.id}>
              {vehicleLabelOf(trip)}
              {' · '}
              {t(`status.${trip.status}`)}
            </li>
          ))}
        </ul>

        {feedbackKey === null ? null : (
          <p className={styles.alert} role="alert">
            {t(`feedback.${feedbackKey}`)}
          </p>
        )}

        <label>
          {t('closeBulkDialog.reasonLabel')}
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
            disabled={trimmedReason.length === 0 || isSubmitting}
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            <Icon name="power" />
            {isSubmitting ? t('closeBulkDialog.closing') : t('closeBulkDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
