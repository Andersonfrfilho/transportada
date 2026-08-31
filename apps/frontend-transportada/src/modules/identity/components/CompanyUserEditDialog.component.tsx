import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatPhone, PHONE_MASK_LENGTH } from '@/modules/shared/phone.service'
import { formatTaxId } from '@/modules/shared/taxId.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { CompanyUserEditForm } from '../hooks/useCompanyUserForm.hook'
import type { CompanyUserPasswordState } from '../hooks/useCompanyUserPassword.hook'
import { readPictureErrorCode, useCompanyUserPicture } from '../hooks/useCompanyUserPicture.hook'
import type { CompanyUserRevealState } from '../hooks/useCompanyUserReveal.hook'
import { CONTACT_CHANNELS } from '../shared/companyUsers.constant'
import type { CompanyUser, ReconciliationEntry } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

import {
  CompanyUserMaskedField,
  CompanyUserRoleField,
  CompanyUserSelectField,
  CompanyUserTextField,
} from './CompanyUserField.component'
import { CompanyUserPasswordPanel } from './CompanyUserPasswordPanel.component'
import { CompanyUserPictureField } from './CompanyUserPictureField.component'
import { CompanyUserRealmMirror } from './CompanyUserRealmMirror.component'
import { CompanyUserStoredField } from './CompanyUserStoredField.component'

/** Os campos guardados que a API entrega mascarados, e que o olho revela um a um. */
const SECRET_FIELDS = ['contact', 'email', 'phone', 'taxId'] as const
type SecretField = (typeof SECRET_FIELDS)[number]

type CompanyUserEditDialogProps = Readonly<{
  form: CompanyUserEditForm
  isPending: boolean
  onClose: () => void
  onFillFromRealm: (userId: string) => void
  onSubmit: () => void
  password: CompanyUserPasswordState
  reveal: CompanyUserRevealState
  user: CompanyUser | null
  errorCode: string | undefined
  isFillingProfile?: boolean
  realmEntry?: ReconciliationEntry | undefined
}>

export function CompanyUserEditDialog({
  errorCode,
  form,
  isFillingProfile = false,
  isPending,
  onClose,
  onFillFromRealm,
  onSubmit,
  password,
  realmEntry,
  reveal,
  user,
}: CompanyUserEditDialogProps) {
  const { t } = useTranslation('identity')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: user !== null, onClose })
  /**
   * O que está à mostra é por campo e morre com o diálogo. A revelação em si é uma chamada só — a
   * API devolve a ficha inteira e grava uma linha de auditoria —, mas mostrar tudo de uma vez só
   * porque alguém quis conferir o telefone deixaria o CPF aberto na tela sem ninguém ter pedido.
   */
  const [visibleFields, setVisibleFields] = useState<readonly SecretField[]>([])
  /** Qual dado está aberto para troca. Fechar limpa o que foi digitado: desistir é desistir. */
  const [editingFields, setEditingFields] = useState<readonly SecretField[]>([])
  const picture = useCompanyUserPicture({ userId: user?.id })

  if (user === null) return null

  const revealed = reveal.revealed.get(user.id)

  async function showField(field: SecretField): Promise<void> {
    if (user === null) return
    await reveal.reveal([user.id])
    setVisibleFields((current) => (current.includes(field) ? current : [...current, field]))
  }

  async function showEveryField(): Promise<void> {
    if (user === null) return
    await reveal.reveal([user.id])
    setVisibleFields(SECRET_FIELDS)
  }

  function hideEveryField(): void {
    setVisibleFields([])
  }

  function startEditing(field: SecretField): void {
    setEditingFields((current) => (current.includes(field) ? current : [...current, field]))
  }

  const CLEAR_FIELD: Readonly<Record<SecretField, () => void>> = {
    contact: () => form.setContact(''),
    email: () => form.setEmail(''),
    phone: () => form.setPhone(''),
    taxId: () => form.setTaxId(''),
  }

  function stopEditing(field: SecretField): void {
    setEditingFields((current) => current.filter((entry) => entry !== field))
    CLEAR_FIELD[field]()
  }

  function storedValueOf(field: SecretField): string {
    const masked =
      field === 'contact'
        ? user?.contact.masked
        : field === 'email'
          ? user?.email
          : field === 'phone'
            ? user?.phone
            : user?.taxId
    if (!visibleFields.includes(field) || revealed === undefined) return masked ?? ''
    return revealed[field]
  }

  function editorOf(field: SecretField): ReactNode {
    if (field === 'contact') {
      return (
        <CompanyUserTextField
          disabled={isPending}
          hint={
            form.isContactRequired
              ? t('users.editDialog.contactRequired')
              : t('users.editDialog.contactHint')
          }
          isWide
          label={t('users.editDialog.contact')}
          onChange={form.setContact}
          value={form.contact}
        />
      )
    }
    if (field === 'email') {
      return (
        <CompanyUserTextField
          disabled={isPending}
          hint={t('users.editDialog.emailHint')}
          isWide
          label={t('users.editDialog.email')}
          onChange={form.setEmail}
          value={form.email}
        />
      )
    }
    if (field === 'phone') {
      return (
        <CompanyUserMaskedField
          disabled={isPending}
          format={formatPhone}
          hint={t('users.editDialog.phoneHint')}
          inputMode="tel"
          label={t('users.editDialog.phone')}
          maxLength={PHONE_MASK_LENGTH}
          onChange={form.setPhone}
          value={form.phone}
        />
      )
    }
    return (
      <CompanyUserMaskedField
        disabled={isPending}
        format={formatTaxId}
        hint={t('users.editDialog.taxIdHint')}
        label={t('users.editDialog.taxId')}
        onChange={form.setTaxId}
        value={form.taxId}
      />
    )
  }

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
            <p className={styles.hint}>
              {user.name === '' ? t('users.noProfile') : user.name} · {user.contact.masked}
            </p>
          </div>
          <div className={styles.panelActions}>
            {!reveal.canReveal ? null : visibleFields.length === SECRET_FIELDS.length ? (
              <Button onClick={hideEveryField} size="sm" type="button" variant="ghost">
                <Icon name="eyeOff" />
                {t('users.editDialog.hideAll')}
              </Button>
            ) : (
              <Button
                disabled={reveal.isPending}
                onClick={() => void showEveryField()}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="eye" />
                {t('users.editDialog.revealAll')}
              </Button>
            )}
            <Button
              aria-label={t('users.editDialog.close')}
              onClick={onClose}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
            </Button>
          </div>
        </header>

        <CompanyUserPictureField
          errorCode={readPictureErrorCode(picture)}
          isLoading={picture.query.isLoading}
          isPending={picture.replaceMutation.isPending || picture.removeMutation.isPending}
          name={user.name === '' ? user.contact.masked : user.name}
          onRemove={() => picture.removeMutation.mutate()}
          onSelect={(file) => picture.replaceMutation.mutate(file)}
          pictureUrl={picture.objectUrl}
        />

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
        </div>

        {/**
         * Um lugar por dado: o valor guardado, o olho e o lápis na mesma linha, e o campo de troca
         * abrindo abaixo dele. Trocar o canal abre o contato sozinho — sem contato correspondente o
         * envio é recusado, e o campo estaria fechado justo quando ele passa a ser obrigatório.
         */}
        <div className={styles.storedFieldList}>
          {SECRET_FIELDS.map((field) => (
            <CompanyUserStoredField
              canReveal={reveal.canReveal}
              editor={editorOf(field)}
              isEditing={
                editingFields.includes(field) || (field === 'contact' && form.isContactRequired)
              }
              isRevealing={reveal.isPending}
              isVisible={visibleFields.includes(field)}
              key={field}
              label={t(`users.editDialog.stored.${field}`)}
              onEdit={() => startEditing(field)}
              onReveal={() => void showField(field)}
              onStopEditing={() => stopEditing(field)}
              value={storedValueOf(field)}
            />
          ))}
        </div>

        <CompanyUserRealmMirror
          disabled={isFillingProfile}
          entry={realmEntry}
          onFillFromRealm={() => onFillFromRealm(user.id)}
        />

        <CompanyUserRoleField
          disabled={isPending}
          hint={t('users.editDialog.rolesHint')}
          label={t('users.editDialog.roles')}
          onToggle={form.toggleRole}
          roles={form.roleChoices}
          selected={form.roles}
        />

        <CompanyUserPasswordPanel
          disabled={isPending}
          password={password}
          userId={user.id}
          username={user.username}
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
