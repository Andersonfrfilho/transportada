/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CompanyUserEditForm } from '../hooks/useCompanyUserForm.hook'
import { CONTACT_CHANNELS } from '../shared/companyUsers.constant'
import type { CompanyUser } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

import {
  CompanyUserRoleField,
  CompanyUserSelectField,
  CompanyUserTextField,
} from './CompanyUserField.component'

type CompanyUserEditDialogProps = Readonly<{
  form: CompanyUserEditForm
  isPending: boolean
  onClose: () => void
  onSubmit: () => void
  user: CompanyUser | null
  errorCode: string | undefined
}>

export function CompanyUserEditDialog({
  errorCode,
  form,
  isPending,
  onClose,
  onSubmit,
  user,
}: CompanyUserEditDialogProps) {
  const { t } = useTranslation('identity')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: user !== null, onClose })

  if (user === null) return null

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="company-user-edit-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="company-user-edit-title">{t('users.editDialog.title')}</h2>
            <p className={styles.hint}>{user.contact.masked}</p>
          </div>
          <Button
            aria-label={t('users.editDialog.close')}
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
            label={t('users.editDialog.name')}
            onChange={form.setName}
            value={form.name}
          />
          <CompanyUserTextField
            disabled={isPending}
            hint={
              form.isUsernameValid
                ? t('users.editDialog.usernameHint')
                : t('users.editDialog.usernameInvalid')
            }
            label={t('users.editDialog.username')}
            onChange={form.setUsername}
            value={form.username}
          />
          <CompanyUserSelectField
            disabled={isPending}
            label={t('users.editDialog.channel')}
            onChange={form.setChannel}
            optionLabelKey="users.channel"
            options={CONTACT_CHANNELS}
            value={form.channel}
          />
          <CompanyUserTextField
            disabled={isPending}
            hint={
              form.isContactRequired
                ? t('users.editDialog.contactRequired')
                : t('users.editDialog.contactHint')
            }
            label={t('users.editDialog.contact')}
            onChange={form.setContact}
            value={form.contact}
          />
          <CompanyUserTextField
            disabled={isPending}
            hint={t('users.editDialog.emailHint')}
            isWide
            label={t('users.editDialog.email')}
            onChange={form.setEmail}
            value={form.email}
          />
        </div>

        <CompanyUserRoleField
          disabled={isPending}
          hint={t('users.editDialog.rolesHint')}
          label={t('users.editDialog.roles')}
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
            {t('users.editDialog.cancel')}
          </Button>
          <Button disabled={!form.isReady || isPending} onClick={onSubmit} type="button">
            <Icon name="save" />
            {isPending ? t('users.editDialog.saving') : t('users.editDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
