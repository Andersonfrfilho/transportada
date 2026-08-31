import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPhone, PHONE_MASK_LENGTH, stripPhone } from '@/modules/shared/phone.service'

import type { CompanyUserIdentifier } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

import { CompanyUserMaskedField, CompanyUserTextField } from './CompanyUserField.component'

type CompanyUserIdentifierFieldsProps = Readonly<{
  identifiers: readonly CompanyUserIdentifier[]
  isLoading: boolean
  isPending: boolean
  onAdd: (entry: Readonly<{ isWhatsapp: boolean; kind: 'email' | 'phone'; value: string }>) => void
  onRemove: (identifierId: string) => void
}>

/**
 * Uma pessoa tem mais de um e-mail e mais de um telefone, e os dois servem a duas coisas ao mesmo
 * tempo: por qualquer um deles ela se identifica no login, e por qualquer um deles se fala com ela.
 * Duas listas separadas obrigariam quem cadastra a digitar o mesmo número duas vezes e a mantê-lo
 * igual nos dois lugares para sempre.
 *
 * O que veio da ficha aparece sem botão de remover: ele volta sozinho na próxima gravação do
 * cadastro, e oferecer a remoção seria promessa que a tela não cumpre — quem quer tirá-lo edita o
 * campo do cadastro, logo acima.
 */
export function CompanyUserIdentifierFields({
  identifiers,
  isLoading,
  isPending,
  onAdd,
  onRemove,
}: CompanyUserIdentifierFieldsProps) {
  const { t } = useTranslation('identity')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [isWhatsapp, setWhatsapp] = useState(true)

  const emails = identifiers.filter((entry) => entry.kind === 'email')
  const phones = identifiers.filter((entry) => entry.kind === 'phone')

  function addEmail(): void {
    if (email.trim() === '') return
    onAdd({ isWhatsapp: false, kind: 'email', value: email.trim() })
    setEmail('')
  }

  function addPhone(): void {
    if (!isCompleteEnough(phone)) return
    onAdd({ isWhatsapp, kind: 'phone', value: stripPhone(phone) })
    setPhone('')
  }

  if (isLoading) return <Skeleton height="8rem" variant="block" />

  return (
    <div className={styles.mirrorPanel}>
      <h3>{t('users.editDialog.identifiers.title')}</h3>
      <p className={styles.fieldHint}>{t('users.editDialog.identifiers.intro')}</p>

      <IdentifierList
        emptyLabel={t('users.editDialog.identifiers.noEmail')}
        entries={emails}
        isPending={isPending}
        label={t('users.editDialog.identifiers.emails')}
        onRemove={onRemove}
      />
      <div className={styles.identifierAdd}>
        <CompanyUserTextField
          disabled={isPending}
          isWide
          label={t('users.editDialog.identifiers.addEmail')}
          onChange={setEmail}
          value={email}
        />
        <Button disabled={isPending || email.trim() === ''} onClick={addEmail} type="button">
          <Icon name="add" />
          {t('users.editDialog.identifiers.add')}
        </Button>
      </div>

      <IdentifierList
        emptyLabel={t('users.editDialog.identifiers.noPhone')}
        entries={phones}
        isPending={isPending}
        label={t('users.editDialog.identifiers.phones')}
        onRemove={onRemove}
      />
      <div className={styles.identifierAdd}>
        <CompanyUserMaskedField
          disabled={isPending}
          format={formatPhone}
          inputMode="tel"
          label={t('users.editDialog.identifiers.addPhone')}
          maxLength={PHONE_MASK_LENGTH}
          onChange={setPhone}
          value={phone}
        />
        <Checkbox
          checked={isWhatsapp}
          disabled={isPending}
          label={t('users.editDialog.identifiers.whatsapp')}
          onChange={setWhatsapp}
        />
        <Button disabled={isPending || !isCompleteEnough(phone)} onClick={addPhone} type="button">
          <Icon name="add" />
          {t('users.editDialog.identifiers.add')}
        </Button>
      </div>
      <p className={styles.fieldHint}>{t('users.editDialog.identifiers.whatsappHint')}</p>
    </div>
  )
}

function IdentifierList({
  emptyLabel,
  entries,
  isPending,
  label,
  onRemove,
}: Readonly<{
  emptyLabel: string
  entries: readonly CompanyUserIdentifier[]
  isPending: boolean
  label: string
  onRemove: (identifierId: string) => void
}>) {
  const { t } = useTranslation('identity')

  return (
    <div className={styles.storedField}>
      <span className={styles.storedFieldLabel}>{label}</span>
      {entries.length === 0 ? (
        <span className={styles.fieldHint}>{emptyLabel}</span>
      ) : (
        entries.map((entry) => (
          <span className={styles.secretRow} key={entry.id}>
            <span className={styles.storedFieldValue}>{entry.value}</span>
            {!entry.isWhatsapp ? null : (
              <span className={styles.badge}>{t('users.editDialog.identifiers.whatsappTag')}</span>
            )}
            {entry.source === 'profile' ? (
              <span className={styles.fieldHint}>
                {t('users.editDialog.identifiers.fromProfile')}
              </span>
            ) : (
              <Button
                aria-label={t('users.editDialog.identifiers.remove')}
                disabled={isPending}
                onClick={() => onRemove(entry.id)}
                size="sm"
                title={t('users.editDialog.identifiers.remove')}
                type="button"
                variant="ghost"
              >
                <Icon name="trash" />
              </Button>
            )}
          </span>
        ))
      )}
    </div>
  )
}

/** Dez ou onze dígitos: fixo com DDD e celular. O servidor recusa o resto, e a tela não oferece. */
function isCompleteEnough(value: string): boolean {
  return [10, 11].includes(stripPhone(value).length)
}
