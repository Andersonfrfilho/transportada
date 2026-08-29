/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatPhone, PHONE_MASK_LENGTH } from '@/modules/shared/phone.service'
import { formatCpf } from '@/modules/shared/taxId.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CompanyUserInviteForm } from '../hooks/useCompanyUserForm.hook'
import type { InviteField } from '../shared/companyUserInvite.service'
import { findInviteIssue, INVITE_FIELD, INVITE_ISSUE } from '../shared/companyUserInvite.service'
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
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const taxIdRef = useRef<HTMLInputElement>(null)
  const rolesRef = useRef<HTMLFieldSetElement>(null)

  /**
   * Dizer o nome do campo põe a pessoa na direção certa; levá-la até ele é o que a poupa de varrer
   * a ficha atrás do rótulo que acabou de ler (`web.md` §11).
   */
  function focusField(field: InviteField): void {
    const target = {
      [INVITE_FIELD.EMAIL]: emailRef,
      [INVITE_FIELD.NAME]: nameRef,
      [INVITE_FIELD.PHONE]: phoneRef,
      [INVITE_FIELD.ROLES]: rolesRef,
      [INVITE_FIELD.TAX_ID]: taxIdRef,
    }[field].current
    target?.scrollIntoView({ block: 'nearest' })
    target?.focus({ preventScroll: true })
  }

  function issueTextOf(field: InviteField): string | undefined {
    const issue = findInviteIssue(form.issues, field)
    if (issue === undefined) return undefined
    if (issue.code === INVITE_ISSUE.REQUIRED && !form.hasSubmitAttempt) return undefined
    return t(`users.inviteDialog.issue.${issue.code}`, { field: t(`users.inviteDialog.${field}`) })
  }

  /** A recusa do servidor por CPF repetido é do campo, não do rodapé: ancorá-la evita a caça. */
  const taxIdErrorText = resolveTaxIdError({
    errorCode,
    issueText: issueTextOf(INVITE_FIELD.TAX_ID),
    t,
  })
  const pendingIssues = form.hasSubmitAttempt ? form.issues : []

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
            {...withErrorText(issueTextOf(INVITE_FIELD.NAME))}
            inputRef={nameRef}
            isWide
            label={t('users.inviteDialog.name')}
            onChange={form.setName}
            value={form.name}
          />
          <CompanyUserSelectField
            disabled={isPending}
            hint={t('users.inviteDialog.channelHint')}
            label={t('users.inviteDialog.channel')}
            onChange={form.setChannel}
            optionLabelKey="users.channel"
            options={CONTACT_CHANNELS}
            value={form.channel}
          />
        </div>

        <div className={styles.fieldGrid}>
          <CompanyUserTextField
            autoComplete="email"
            disabled={isPending}
            {...withErrorText(issueTextOf(INVITE_FIELD.EMAIL))}
            {...contactHintOf({ field: INVITE_FIELD.EMAIL, form, t })}
            inputRef={emailRef}
            label={t('users.inviteDialog.email')}
            onChange={form.setEmail}
            value={form.email}
          />
          <CompanyUserMaskedField
            disabled={isPending}
            {...withErrorText(issueTextOf(INVITE_FIELD.PHONE))}
            format={formatPhone}
            {...contactHintOf({ field: INVITE_FIELD.PHONE, form, t })}
            inputMode="tel"
            inputRef={phoneRef}
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
            inputRef={taxIdRef}
            label={t('users.inviteDialog.taxId')}
            maxLength={CPF_MASK_LENGTH}
            onChange={form.setTaxId}
            value={form.taxId}
          />
        </div>

        <CompanyUserRoleField
          disabled={isPending}
          groupRef={rolesRef}
          hint={t('users.inviteDialog.rolesHint')}
          label={t('users.inviteDialog.roles')}
          onToggle={form.toggleRole}
          roles={form.roleChoices}
          selected={form.roles}
        />

        {pendingIssues.length === 0 ? null : (
          <p className={styles.feedback} role="alert">
            {t('users.inviteDialog.pending')}{' '}
            {pendingIssues.map((issue, index) => (
              <span key={issue.field}>
                {index === 0 ? '' : ', '}
                <Button
                  onClick={() => focusField(issue.field)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t(`users.inviteDialog.${issue.field}`)}
                </Button>
              </span>
            ))}
          </p>
        )}

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
          <Button disabled={isPending} onClick={onSubmit} type="button">
            <Icon name="send" />
            {isPending ? t('users.inviteDialog.sending') : t('users.inviteDialog.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function withErrorText(errorText: string | undefined): Readonly<{ errorText?: string }> {
  return errorText === undefined ? {} : { errorText }
}

/** O campo que o canal escolheu é o que leva o convite — dizer isso nele evita o campo "Contato". */
function contactHintOf({
  field,
  form,
  t,
}: Readonly<{
  field: InviteField
  form: CompanyUserInviteForm
  t: (key: string) => string
}>): Readonly<{ hint?: string }> {
  return form.contactField === field ? { hint: t('users.inviteDialog.contactField') } : {}
}

function resolveTaxIdError({
  errorCode,
  issueText,
  t,
}: Readonly<{
  errorCode: string | undefined
  issueText: string | undefined
  t: (key: string) => string
}>): string | undefined {
  if (issueText !== undefined) return issueText
  if (errorCode === COMPANY_USER_API_ERROR.TAX_ID_TAKEN)
    return t(`users.errors.${COMPANY_USER_API_ERROR.TAX_ID_TAKEN}`)
  return undefined
}
