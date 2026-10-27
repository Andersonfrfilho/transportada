/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useDeliveryClientEmails } from '../hooks/useDeliveryClientEmails.hook'
import {
  DELIVERY_CLIENT_EMAILS_ERROR,
  DeliveryClientEmailsRequestError,
} from '../shared/deliveryClientEmailsClient.service'
import {
  DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
  DELIVERY_CLIENT_EMAIL_PURPOSES,
  type DeliveryClientEmail,
  type DeliveryClientEmailPurpose,
} from '../shared/deliveryClientEmails.types'
import {
  groupDeliveryClientEmailsByPurpose,
  validateDeliveryClientEmailDraft,
} from '../shared/deliveryClientEmails.validation'
import styles from '../styles/deliveryClients.module.css'

type DeliveryClientEmailsPanelProps = Readonly<{
  /** Editar o cadastro é `fleet.manage`; sem ele a lista fica só para leitura. */
  isDisabled: boolean
  /** Spec 279 RF5: o tipo que vem selecionado ao adicionar (`boleto` quando se chega pelo botão do boleto). */
  initialPurpose?: DeliveryClientEmailPurpose
  taxId: string
}>

function failureKey(error: unknown): string {
  const code = error instanceof DeliveryClientEmailsRequestError ? error.message : ''
  if (code === DELIVERY_CLIENT_EMAILS_ERROR.LIMIT_REACHED) return 'limitReached'
  if (code === 'DELIVERY_CLIENT_EMAIL_ADDRESS_INVALID') return 'addressInvalid'
  return 'generic'
}

type EmailRowProps = Readonly<{
  email: DeliveryClientEmail
  isBusy: boolean
  isDisabled: boolean
  onRemove: (emailId: string) => void
  onSaveLabel: (emailId: string, label: string) => void
}>

function EmailRow({
  email,
  isBusy,
  isDisabled,
  onRemove,
  onSaveLabel,
}: EmailRowProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const [label, setLabel] = useState<null | string>(null)
  const [isConfirmingRemoval, setConfirmingRemoval] = useState(false)
  const isEditing = label !== null

  return (
    <li className={styles.clientEmailRow}>
      <div className={styles.clientEmailMain}>
        <span className={styles.document}>{email.addressMasked}</span>
        {isEditing ? (
          <input
            aria-label={t('clientEmails.labelField')}
            autoComplete="off"
            maxLength={DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH}
            onChange={(event) => setLabel(event.target.value)}
            value={label}
          />
        ) : email.label === '' ? null : (
          <Badge variant="secondary">{email.label}</Badge>
        )}
        {email.createdByKind === 'driver' ? (
          <Badge variant="info">{t('clientEmails.byDriver')}</Badge>
        ) : null}
      </div>
      {isDisabled ? null : (
        <div className={styles.clientEmailActions}>
          {isEditing ? (
            <>
              <Button
                disabled={isBusy}
                onClick={() => {
                  onSaveLabel(email.id, label.trim())
                  setLabel(null)
                }}
                size="sm"
                type="button"
              >
                <Icon name="check" size="sm" />
                {t('clientEmails.saveLabel')}
              </Button>
              <Button onClick={() => setLabel(null)} size="sm" type="button" variant="ghost">
                {t('clientEmails.cancel')}
              </Button>
            </>
          ) : isConfirmingRemoval ? (
            <>
              <Button
                disabled={isBusy}
                onClick={() => {
                  onRemove(email.id)
                  setConfirmingRemoval(false)
                }}
                size="sm"
                type="button"
              >
                <Icon name="trash" size="sm" />
                {t('clientEmails.confirmRemove')}
              </Button>
              <Button
                onClick={() => setConfirmingRemoval(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t('clientEmails.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button
                aria-label={t('clientEmails.editLabelOf', { address: email.addressMasked })}
                onClick={() => setLabel(email.label)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="edit" size="sm" />
                {t('clientEmails.editLabel')}
              </Button>
              <Button
                aria-label={t('clientEmails.removeOf', { address: email.addressMasked })}
                onClick={() => setConfirmingRemoval(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="trash" size="sm" />
                {t('clientEmails.remove')}
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Spec 279 RF1/RF5 (T5): os e-mails do cliente de entrega, agrupados por tipo — boleto, nota fiscal, financeiro e
 * geral. O operador adiciona (escolhendo o tipo), troca o rótulo e remove; o endereço só aparece mascarado, e o
 * claro só vai no corpo do POST. A API é quem decide limite (10 por tipo) e duplicata.
 */
export function DeliveryClientEmailsPanel({
  initialPurpose = 'boleto',
  isDisabled,
  taxId,
}: DeliveryClientEmailsPanelProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const { addMutation, labelMutation, listQuery, removeMutation } = useDeliveryClientEmails({
    enabled: true,
    taxId,
  })
  const [isAdding, setAdding] = useState(false)
  const [address, setAddress] = useState('')
  const [label, setLabel] = useState('')
  const [purpose, setPurpose] = useState<DeliveryClientEmailPurpose>(initialPurpose)
  const [isSubmitted, setSubmitted] = useState(false)

  const emails = listQuery.data ?? []
  const issues = isSubmitted ? validateDeliveryClientEmailDraft({ address, label, purpose }) : {}
  const actionError = addMutation.error ?? labelMutation.error ?? removeMutation.error
  const isBusy = addMutation.isPending || labelMutation.isPending || removeMutation.isPending

  function close(): void {
    setAdding(false)
    setAddress('')
    setLabel('')
    setSubmitted(false)
    addMutation.reset()
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setSubmitted(true)
    const draft = { address: address.trim(), label: label.trim(), purpose }
    if (Object.keys(validateDeliveryClientEmailDraft(draft)).length > 0) return
    addMutation.mutate(draft, { onSuccess: close })
  }

  return (
    <section aria-labelledby="client-emails-title" className={styles.clientEmails}>
      <header className={styles.clientEmailsHead}>
        <div>
          <h3 id="client-emails-title">{t('clientEmails.title')}</h3>
          <p className={styles.hint}>{t('clientEmails.hint')}</p>
        </div>
        {isDisabled || isAdding ? null : (
          <Button onClick={() => setAdding(true)} size="sm" type="button">
            <Icon name="add" size="sm" />
            {t('clientEmails.add')}
          </Button>
        )}
      </header>

      {isAdding ? (
        <form className={styles.clientEmailForm} noValidate onSubmit={submit}>
          <label className={styles.field}>
            <span>{t('clientEmails.purposeField')}</span>
            <Select
              ariaLabel={t('clientEmails.purposeField')}
              onChange={(value) =>
                setPurpose(
                  DELIVERY_CLIENT_EMAIL_PURPOSES.find((item) => item === value) ?? 'boleto',
                )
              }
              options={DELIVERY_CLIENT_EMAIL_PURPOSES.map((item) => ({
                label: t(`clientEmails.purpose.${item}`),
                value: item,
              }))}
              value={purpose}
            />
          </label>
          <label className={styles.field}>
            <span>{t('clientEmails.addressField')}</span>
            <input
              aria-invalid={issues.address !== undefined}
              autoComplete="off"
              disabled={isBusy}
              inputMode="email"
              maxLength={DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH}
              onChange={(event) => setAddress(event.target.value)}
              type="text"
              value={address}
            />
            {issues.address === undefined ? null : (
              <span className={styles.error} role="alert">
                {t('clientEmails.failure.addressInvalid')}
              </span>
            )}
          </label>
          <label className={styles.field}>
            <span>{t('clientEmails.labelField')}</span>
            <input
              autoComplete="off"
              disabled={isBusy}
              maxLength={DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t('clientEmails.labelPlaceholder')}
              type="text"
              value={label}
            />
          </label>
          {addMutation.isError ? (
            <p className={styles.error} role="alert">
              {t(`clientEmails.failure.${failureKey(addMutation.error)}`, {
                max: DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
              })}
            </p>
          ) : null}
          <div className={styles.contactActions}>
            <Button disabled={isBusy} onClick={close} size="sm" type="button" variant="ghost">
              {t('clientEmails.cancel')}
            </Button>
            <Button disabled={isBusy} size="sm" type="submit">
              {t('clientEmails.save')}
            </Button>
          </div>
        </form>
      ) : null}

      {listQuery.isLoading ? (
        <SkeletonGroup label={t('clientEmails.loading')}>
          <Skeleton height="2rem" />
          <Skeleton height="2rem" />
        </SkeletonGroup>
      ) : listQuery.isError ? (
        <p className={styles.error} role="alert">
          {t('clientEmails.failure.load')}
        </p>
      ) : emails.length === 0 ? (
        <p className={styles.hint}>{t('clientEmails.empty')}</p>
      ) : (
        groupDeliveryClientEmailsByPurpose(emails).map((group) => (
          <div className={styles.clientEmailGroup} key={group.purpose}>
            <h4>
              {t(`clientEmails.purpose.${group.purpose}`)}
              <span className={styles.hint}>
                {' '}
                · {group.emails.length}/{DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE}
              </span>
            </h4>
            <ul className={styles.clientEmailList}>
              {group.emails.map((email) => (
                <EmailRow
                  email={email}
                  isBusy={isBusy}
                  isDisabled={isDisabled}
                  key={email.id}
                  onRemove={(emailId) => removeMutation.mutate(emailId)}
                  onSaveLabel={(emailId, nextLabel) =>
                    labelMutation.mutate({ emailId, label: nextLabel })
                  }
                />
              ))}
            </ul>
          </div>
        ))
      )}
      {actionError !== null && !addMutation.isError ? (
        <p className={styles.error} role="alert">
          {t(`clientEmails.failure.${failureKey(actionError)}`)}
        </p>
      ) : null}
    </section>
  )
}
