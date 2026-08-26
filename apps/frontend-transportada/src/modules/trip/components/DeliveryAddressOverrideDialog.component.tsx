/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useDeliveryAddressOverrideDialog } from '../hooks/useDeliveryAddressOverrideDialog.hook'
import type { DeliveryAddressOverride, OverrideDeliveryAddressInput } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type DeliveryAddressOverrideDialogProps = Readonly<{
  documentId: string
  documentLabel: string
  isOpen: boolean
  loadHistory: () => Promise<readonly DeliveryAddressOverride[]>
  onClose: () => void
  onOverride: (input: OverrideDeliveryAddressInput) => Promise<unknown>
  tripId: string
}>

/**
 * ADR-0043 §3 (D9): menu explícito, nunca edição em linha — a única forma de mudar o endereço de
 * entrega passa por este diálogo, que sempre pede quem pediu e por quê.
 */
export function DeliveryAddressOverrideDialog({
  documentId,
  documentLabel,
  isOpen,
  loadHistory,
  onClose,
  onOverride,
  tripId,
}: DeliveryAddressOverrideDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const dialog = useDeliveryAddressOverrideDialog({ documentId, loadHistory, onOverride, tripId })

  useEffect(() => {
    if (!isOpen) return
    dialog.reset()
    void dialog.refreshHistory()
  }, [isOpen, dialog.reset, dialog.refreshHistory])

  if (!isOpen) return null

  async function handleSubmit(): Promise<void> {
    const succeeded = await dialog.submit()
    if (succeeded) onClose()
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="delivery-address-override-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="delivery-address-override-title">{t('deliveryOverride.title')}</h2>
            <p className={styles.mdfeGateSubtitle}>
              {t('deliveryOverride.subtitle', { document: documentLabel })}
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

        <div className={styles.fieldGrid}>
          <label>
            {t('deliveryOverride.postalCode')}
            <input
              autoComplete="off"
              onChange={(event) => dialog.setField('postalCode', event.target.value)}
              value={dialog.draft.postalCode}
            />
          </label>
          <label>
            {t('deliveryOverride.number')}
            <input
              autoComplete="off"
              onChange={(event) => dialog.setField('number', event.target.value)}
              value={dialog.draft.number}
            />
          </label>
          <label>
            {t('deliveryOverride.cityCode')}
            <input
              autoComplete="off"
              onChange={(event) => dialog.setField('cityCode', event.target.value)}
              value={dialog.draft.cityCode}
            />
          </label>
          <label>
            {t('deliveryOverride.newLabel')}
            <input
              autoComplete="off"
              onChange={(event) => dialog.setField('newLabel', event.target.value)}
              value={dialog.draft.newLabel}
            />
          </label>
          <label>
            {t('deliveryOverride.requestedBy')}
            <input
              autoComplete="off"
              onChange={(event) => dialog.setField('requestedBy', event.target.value)}
              value={dialog.draft.requestedBy}
            />
            <span className={styles.hint}>{t('deliveryOverride.requestedByHint')}</span>
          </label>
          <label>
            {t('deliveryOverride.reason')}
            <input
              autoComplete="off"
              onChange={(event) => dialog.setField('reason', event.target.value)}
              value={dialog.draft.reason}
            />
          </label>
        </div>

        {dialog.submitError === undefined ? null : (
          <p className={styles.alert} role="alert">
            {t(`feedback.${dialog.submitError}`, { defaultValue: dialog.submitError })}
          </p>
        )}

        <h3>{t('deliveryOverride.historyTitle')}</h3>
        {dialog.isLoadingHistory ? (
          <SkeletonGroup className={styles.mdfeGateList} label={t('loading')}>
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width="55%" />
          </SkeletonGroup>
        ) : null}
        {!dialog.isLoadingHistory && dialog.history.length === 0 ? (
          <p className={styles.hint}>{t('deliveryOverride.historyEmpty')}</p>
        ) : null}
        <ul className={styles.mdfeGateList}>
          {dialog.history.map((override) => (
            <li className={styles.mdfeGateListItem} key={override.id}>
              <span>
                {t('deliveryOverride.historyEntry', {
                  from: override.previousLabel,
                  to: override.newLabel,
                })}
              </span>
              <span>
                {t('deliveryOverride.historyRequestedBy', { name: override.requestedBy })}
              </span>
            </li>
          ))}
        </ul>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button
            disabled={!dialog.canSubmit || dialog.isSubmitting}
            onClick={() => void handleSubmit()}
            size="sm"
            type="button"
          >
            <Icon name="save" />
            {t('deliveryOverride.submit')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
