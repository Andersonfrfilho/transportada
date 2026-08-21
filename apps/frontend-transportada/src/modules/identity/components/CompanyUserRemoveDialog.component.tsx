/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CompanyUser } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyUserRemoveDialogProps = Readonly<{
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
  user: CompanyUser | null
  errorCode: string | undefined
}>

export function CompanyUserRemoveDialog({
  errorCode,
  isPending,
  onClose,
  onConfirm,
  user,
}: CompanyUserRemoveDialogProps) {
  const { t } = useTranslation('identity')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: user !== null, onClose })

  if (user === null) return null

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="company-user-remove-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="company-user-remove-title">{t('users.removeDialog.title')}</h2>
            <p className={styles.hint}>
              {user.name} · {user.contact.masked}
            </p>
          </div>
          <Button
            aria-label={t('users.removeDialog.close')}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </header>

        <p className={styles.hint}>{t('users.removeDialog.warning')}</p>

        {errorCode === undefined ? null : (
          <p className={styles.feedback} role="alert">
            {t(`users.errors.${errorCode}`, { defaultValue: t('users.errors.default') })}
          </p>
        )}

        <footer className={styles.dialogFooter}>
          <Button onClick={onClose} type="button" variant="ghost">
            <Icon name="close" />
            {t('users.removeDialog.cancel')}
          </Button>
          <Button disabled={isPending} onClick={onConfirm} type="button">
            <Icon name="trash" />
            {isPending ? t('users.removeDialog.removing') : t('users.removeDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
