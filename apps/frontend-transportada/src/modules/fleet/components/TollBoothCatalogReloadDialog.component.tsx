/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T303: a confirmação da recarga (RF4) — o efeito atinge o catálogo da instalação
 * inteira, todas as empresas do deploy (D6), por isso o botão nunca dispara sozinho. Molde de
 * `CompanyUserRemoveDialog.component.tsx` (`useModalDialog`, portal, foco preso).
 */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useDayFormatter } from '../hooks/useDayFormatter.hook'
import type { TollBoothExtractRow } from '../shared/tollBoothExtract.validation'
import styles from '../styles/fleet.module.css'
import { TollBoothCatalogReloadError } from './TollBoothCatalogReloadError.component'

export type TollBoothCatalogReloadDialogProps = Readonly<{
  errorCode: string | undefined
  extract: TollBoothExtractRow | null
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}>

export function TollBoothCatalogReloadDialog(props: TollBoothCatalogReloadDialogProps) {
  const { t } = useTranslation('fleet')
  const formatDay = useDayFormatter()
  const { extract } = props
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: extract !== null,
    onClose: props.onClose,
  })

  if (extract === null) return null

  return createPortal(
    <div
      className={`${styles.overlay} ${styles.tollBoothPanel}`}
      onKeyDown={handleKeyDown}
      role="presentation"
    >
      <div
        aria-labelledby="toll-booth-reload-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="toll-booth-reload-title">{t('tollBoothCharges.reload.confirmTitle')}</h2>
            <p className={styles.hint}>
              {t('tollBoothCharges.reload.confirmSubtitle', {
                dataset: extract.dataset,
                date: formatDay(extract.observedOn),
              })}
            </p>
          </div>
          <Button
            aria-label={t('tollBoothCharges.reload.close')}
            onClick={props.onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </header>

        <p className={styles.feedback} role="alert">
          {t('tollBoothCharges.reload.confirmWarning')}
        </p>

        {props.errorCode !== undefined && (
          <TollBoothCatalogReloadError errorCode={props.errorCode} />
        )}

        <footer className={styles.dialogFooter}>
          <Button onClick={props.onClose} type="button" variant="ghost">
            {t('tollBoothCharges.reload.cancel')}
          </Button>
          <Button disabled={props.isPending} onClick={props.onConfirm} type="button">
            <Icon name="download" />
            {props.isPending
              ? t('tollBoothCharges.reload.reloading')
              : t('tollBoothCharges.reload.confirmButton')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
