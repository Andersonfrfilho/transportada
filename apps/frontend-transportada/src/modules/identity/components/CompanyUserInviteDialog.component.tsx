/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CompanyUserInviteForm } from '../hooks/useCompanyUserForm.hook'
import { CONTACT_CHANNELS } from '../shared/companyUsers.constant'
import styles from '../styles/userAdministration.module.css'

import {
  CompanyUserRoleField,
  CompanyUserSelectField,
  CompanyUserTextField,
} from './CompanyUserField.component'

type CompanyUserInviteDialogProps = Readonly<{
  form: CompanyUserInviteForm
  isOpen: boolean
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  errorCode: string | undefined
}>

export function CompanyUserInviteDialog({
  errorCode,
  form,
  isOpen,
  isPending,
  onClose,
  onSubmit,
}: CompanyUserInviteDialogProps) {
  const { t } = useTranslation('identity')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })

  if (!isOpen) return null

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="company-user-invite-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="company-user-invite-title">{t('users.inviteDialog.title')}</h2>
            <p className={styles.hint}>{t('users.inviteDialog.intro')}</p>
          </div>
          <Button
            aria-label={t('users.inviteDialog.close')}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </header>

        <div className={styles.fieldGrid}>
          <CompanyUserTextField
            disabled={isPending}
            isWide
            label={t('users.inviteDialog.name')}
            onChange={form.setName}
            value={form.name}
          />
          <CompanyUserSelectField
            disabled={isPending}
            label={t('users.inviteDialog.channel')}
            onChange={form.setChannel}
            optionLabelKey="users.channel"
            options={CONTACT_CHANNELS}
            value={form.channel}
          />
          <CompanyUserTextField
            disabled={isPending}
            hint={t('users.inviteDialog.contactHint')}
            label={t('users.inviteDialog.contact')}
            onChange={form.setContact}
            value={form.contact}
          />
        </div>

        <CompanyUserRoleField
          disabled={isPending}
          hint={t('users.inviteDialog.rolesHint')}
          label={t('users.inviteDialog.roles')}
          onToggle={form.toggleRole}
          roles={form.roleChoices}
          selected={form.roles}
        />

        {errorCode === undefined ? null : (
          <p className={styles.feedback} role="alert">
            {t(`users.errors.${errorCode}`, { defaultValue: t('users.errors.default') })}
          </p>
        )}

        <footer className={styles.dialogFooter}>
          <Button onClick={onClose} type="button" variant="ghost">
            <Icon name="close" />
            {t('users.inviteDialog.cancel')}
          </Button>
          <Button disabled={!form.isReady || isPending} onClick={onSubmit} type="button">
            <Icon name="send" />
            {isPending ? t('users.inviteDialog.sending') : t('users.inviteDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
