/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'
import {
  DRIVER_RETURN_REASONS,
  type DriverReturnReason,
} from '@/modules/driver-trip/shared/driverTrip.types'

import styles from '../styles/trip.module.css'

type TripReturnReasonDialogProps = Readonly<{
  isOpen: boolean
  isSubmitting: boolean
  items?: readonly string[]
  onClose: () => void
  onSubmit: (reason: DriverReturnReason) => void
  subtitle?: string
  title: string
}>

/**
 * Spec 156 T8b, ADR-0067: o motivo da devolução com autoria deixa de ser texto livre — passa a ser
 * um dos `DRIVER_RETURN_REASONS` (a mesma lista fechada que o app do motorista já usa), porque
 * `field-return` exige um enum, não uma frase. Mesmo molde visual de `TripReasonDialog`.
 */
export function TripReturnReasonDialog({
  isOpen,
  isSubmitting,
  items,
  onClose,
  onSubmit,
  subtitle,
  title,
}: TripReturnReasonDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const [reason, setReason] = useState<DriverReturnReason>(DRIVER_RETURN_REASONS[0])

  if (!isOpen) return null

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-return-reason-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-return-reason-dialog-title">{title}</h2>
            {subtitle === undefined ? null : <p className={styles.mdfeGateSubtitle}>{subtitle}</p>}
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

        {items === undefined || items.length === 0 ? null : (
          <ul className={styles.mdfeGateList}>
            {items.map((item) => (
              <li className={styles.mdfeGateListItem} key={item}>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        <label>
          {t('stateActions.returnReasonLabel')}
          <Select
            ariaLabel={t('stateActions.returnReasonLabel')}
            onChange={(value) => setReason(value as DriverReturnReason)}
            options={DRIVER_RETURN_REASONS.map((option) => ({
              label: t(`fieldActions.returnReason.${option}`),
              value: option,
            }))}
            value={reason}
          />
        </label>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button disabled={isSubmitting} onClick={() => onSubmit(reason)} size="sm" type="button">
            <Icon name="check" />
            {t('stateActions.returnSubmit')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
