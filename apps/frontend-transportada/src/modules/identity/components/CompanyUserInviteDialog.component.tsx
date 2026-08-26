/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatPhone, PHONE_MASK_LENGTH } from '@/modules/shared/phone.service'
import { formatCpf } from '@/modules/shared/taxId.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CompanyUserInviteForm } from '../hooks/useCompanyUserForm.hook'
import { COMPANY_USER_API_ERROR, CONTACT_CHANNELS } from '../shared/companyUsers.constant'
import styles from '../styles/userAdministration.module.css'

import {
  CompanyUserMaskedField,
  CompanyUserRoleField,
  CompanyUserSelectField,
  CompanyUserTextField,
} from './CompanyUserField.component'

/** `123.456.789-09` — onze dígitos e três separadores. */
const CPF_MASK_LENGTH = 14

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

  /** A recusa do servidor por CPF repetido é do campo, não do rodapé: ancorá-la evita a caça. */
  const taxIdErrorText = resolveTaxIdError({ errorCode, isTaxIdValid: form.isTaxIdValid, t })

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

        <div className={styles.fieldGrid}>
          <CompanyUserTextField
            autoComplete="email"
            disabled={isPending}
            {...(form.isEmailValid ? {} : { errorText: t('users.inviteDialog.emailInvalid') })}
            label={t('users.inviteDialog.email')}
            onChange={form.setEmail}
            value={form.email}
          />
          <CompanyUserMaskedField
            disabled={isPending}
            {...(form.isPhoneValid ? {} : { errorText: t('users.inviteDialog.phoneInvalid') })}
            format={formatPhone}
            inputMode="tel"
            label={t('users.inviteDialog.phone')}
            maxLength={PHONE_MASK_LENGTH}
            onChange={form.setPhone}
            value={form.phone}
          />
          <CompanyUserMaskedField
            disabled={isPending}
            {...(taxIdErrorText === undefined ? {} : { errorText: taxIdErrorText })}
            format={formatCpf}
            hint={t('users.inviteDialog.taxIdHint')}
            inputMode="numeric"
            label={t('users.inviteDialog.taxId')}
            maxLength={CPF_MASK_LENGTH}
            onChange={form.setTaxId}
            value={form.taxId}
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

        {errorCode === undefined || errorCode === COMPANY_USER_API_ERROR.TAX_ID_TAKEN ? null : (
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

function resolveTaxIdError({
  errorCode,
  isTaxIdValid,
  t,
}: Readonly<{
  errorCode: string | undefined
  isTaxIdValid: boolean
  t: (key: string) => string
}>): string | undefined {
  if (!isTaxIdValid) return t('users.inviteDialog.taxIdInvalid')
  if (errorCode === COMPANY_USER_API_ERROR.TAX_ID_TAKEN)
    return t(`users.errors.${COMPANY_USER_API_ERROR.TAX_ID_TAKEN}`)
  return undefined
}
