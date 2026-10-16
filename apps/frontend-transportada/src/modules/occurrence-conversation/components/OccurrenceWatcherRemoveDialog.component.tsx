/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from '../styles/occurrenceConversation.module.css'

type OccurrenceWatcherRemoveDialogProps = Readonly<{
  isPending: boolean
  name: string
  onCancel: () => void
  onConfirm: () => void
}>

/** Remover apaga a linha: a confirmação é na página, com o verbo e o nome, nunca `window.confirm`. */
export function OccurrenceWatcherRemoveDialog({
  isPending,
  name,
  onCancel,
  onConfirm,
}: OccurrenceWatcherRemoveDialogProps) {
  const { t } = useTranslation('occurrenceConversation')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose: onCancel })

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-describedby="occurrence-watcher-remove-body"
        aria-labelledby="occurrence-watcher-remove-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <h2 id="occurrence-watcher-remove-title">{t('watchers.removeDialog.title', { name })}</h2>
        </header>
        <p className={styles.hint} id="occurrence-watcher-remove-body">
          {t('watchers.removeDialog.body')}
        </p>
        <div className={styles.footer}>
          <Button disabled={isPending} onClick={onCancel} type="button" variant="ghost">
            {t('watchers.removeDialog.cancel')}
          </Button>
          <Button disabled={isPending} onClick={onConfirm} type="button">
            {t('watchers.removeDialog.confirm')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
