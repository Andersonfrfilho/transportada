/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useDeliveryClientWhatsApp } from '../hooks/useDeliveryClientWhatsApp.hook'
import { DeliveryClientEmailsRequestError } from '../shared/deliveryClientEmailsClient.service'
import {
  DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH,
  DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
} from '../shared/deliveryClientEmails.types'
import type { DeliveryClientWhatsApp } from '../shared/deliveryClientWhatsApp.types'
import { isDeliveryClientWhatsAppNumberValid } from '../shared/deliveryClientWhatsApp.validation'
import styles from '../styles/deliveryClients.module.css'

type DeliveryClientWhatsAppPanelProps = Readonly<{
  /** Editar o cadastro é `fleet.manage`; sem ele a lista fica só para leitura. */
  isDisabled: boolean
  taxId: string
}>

function failureKey(error: unknown): string {
  const code = error instanceof DeliveryClientEmailsRequestError ? error.message : ''
  if (code === 'DELIVERY_CLIENT_WHATSAPP_LIMIT_REACHED') return 'limitReached'
  if (code === 'DELIVERY_CLIENT_WHATSAPP_ALREADY_EXISTS') return 'duplicate'
  if (code === 'WHATSAPP_NUMBER_INVALID') return 'numberInvalid'
  return 'generic'
}

type RowProps = Readonly<{
  isBusy: boolean
  isDisabled: boolean
  item: DeliveryClientWhatsApp
  onRemove: (numberId: string) => void
  onSave: (input: { label: string; number?: string; numberId: string }) => void
}>

function WhatsAppRow({ isBusy, isDisabled, item, onRemove, onSave }: RowProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const [draft, setDraft] = useState<null | { label: string; number: string }>(null)
  const [isConfirmingRemoval, setConfirmingRemoval] = useState(false)
  const isNumberInvalid =
    draft !== null &&
    draft.number.trim() !== '' &&
    !isDeliveryClientWhatsAppNumberValid(draft.number)

  return (
    <li className={styles.clientEmailRow}>
      <div className={styles.clientEmailMain}>
        <span className={styles.document}>{item.numberMasked}</span>
        {draft === null ? (
          item.label === '' ? null : (
            <Badge variant="secondary">{item.label}</Badge>
          )
        ) : (
          <>
            <input
              aria-invalid={isNumberInvalid}
              aria-label={t('clientWhatsApp.numberField')}
              autoComplete="off"
              inputMode="tel"
              onChange={(event) => setDraft({ ...draft, number: event.target.value })}
              placeholder={t('clientWhatsApp.keepNumber')}
              value={draft.number}
            />
            <input
              aria-label={t('clientWhatsApp.labelField')}
              autoComplete="off"
              maxLength={DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              value={draft.label}
            />
          </>
        )}
        {item.createdByKind === 'driver' ? (
          <Badge variant="info">{t('clientEmails.byDriver')}</Badge>
        ) : null}
      </div>
      {isDisabled ? null : (
        <div className={styles.clientEmailActions}>
          {draft !== null ? (
            <>
              <Button
                disabled={isBusy || isNumberInvalid}
                onClick={() => {
                  const number = draft.number.trim()
                  onSave({
                    label: draft.label.trim(),
                    ...(number === '' ? {} : { number }),
                    numberId: item.id,
                  })
                  setDraft(null)
                }}
                size="sm"
                type="button"
              >
                <Icon name="check" size="sm" />
                {t('clientWhatsApp.saveEdit')}
              </Button>
              <Button onClick={() => setDraft(null)} size="sm" type="button" variant="ghost">
                {t('clientEmails.cancel')}
              </Button>
            </>
          ) : isConfirmingRemoval ? (
            <>
              <Button
                disabled={isBusy}
                onClick={() => {
                  onRemove(item.id)
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
                aria-label={t('clientWhatsApp.editOf', { number: item.numberMasked })}
                onClick={() => setDraft({ label: item.label, number: '' })}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="edit" size="sm" />
                {t('clientWhatsApp.edit')}
              </Button>
              <Button
                aria-label={t('clientWhatsApp.removeOf', { number: item.numberMasked })}
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
 * Spec 281 T8b: os números de WhatsApp do cliente de entrega — vários por cliente; o operador adiciona, edita (rótulo
 * e/ou número) e remove. O número só aparece mascarado, e o claro só vai no corpo do POST/PATCH; a API normaliza para
 * E.164 e decide limite (10) e duplicata.
 */
export function DeliveryClientWhatsAppPanel({
  isDisabled,
  taxId,
}: DeliveryClientWhatsAppPanelProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const { addMutation, listQuery, removeMutation, updateMutation } = useDeliveryClientWhatsApp({
    taxId,
  })
  const [isAdding, setAdding] = useState(false)
  const [number, setNumber] = useState('')
  const [label, setLabel] = useState('')
  const [isSubmitted, setSubmitted] = useState(false)

  const items = listQuery.data ?? []
  const isNumberInvalid = isSubmitted && !isDeliveryClientWhatsAppNumberValid(number)
  const actionError = addMutation.error ?? updateMutation.error ?? removeMutation.error
  const isBusy = addMutation.isPending || updateMutation.isPending || removeMutation.isPending

  function close(): void {
    setAdding(false)
    setNumber('')
    setLabel('')
    setSubmitted(false)
    addMutation.reset()
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setSubmitted(true)
    if (!isDeliveryClientWhatsAppNumberValid(number)) return
    addMutation.mutate({ label: label.trim(), number: number.trim() }, { onSuccess: close })
  }

  return (
    <section aria-labelledby="client-whatsapp-title" className={styles.clientEmails}>
      <header className={styles.clientEmailsHead}>
        <div>
          <h3 id="client-whatsapp-title">{t('clientWhatsApp.title')}</h3>
          <p className={styles.hint}>{t('clientWhatsApp.hint')}</p>
        </div>
        {isDisabled || isAdding ? null : (
          <Button onClick={() => setAdding(true)} size="sm" type="button">
            <Icon name="add" size="sm" />
            {t('clientWhatsApp.add')}
          </Button>
        )}
      </header>

      {isAdding ? (
        <form className={styles.clientEmailForm} noValidate onSubmit={submit}>
          <label className={styles.field}>
            <span>{t('clientWhatsApp.numberField')}</span>
            <input
              aria-invalid={isNumberInvalid}
              autoComplete="off"
              disabled={isBusy}
              inputMode="tel"
              onChange={(event) => setNumber(event.target.value)}
              placeholder="(16) 99999-8888"
              type="tel"
              value={number}
            />
            {isNumberInvalid ? (
              <span className={styles.error} role="alert">
                {t('clientWhatsApp.failure.numberInvalid')}
              </span>
            ) : null}
          </label>
          <label className={styles.field}>
            <span>{t('clientWhatsApp.labelField')}</span>
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
              {t(`clientWhatsApp.failure.${failureKey(addMutation.error)}`, {
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
        <SkeletonGroup label={t('clientWhatsApp.loading')}>
          <Skeleton height="2rem" />
        </SkeletonGroup>
      ) : listQuery.isError ? (
        <p className={styles.error} role="alert">
          {t('clientWhatsApp.failure.load')}
        </p>
      ) : items.length === 0 ? (
        <p className={styles.hint}>{t('clientWhatsApp.empty')}</p>
      ) : (
        <ul className={styles.clientEmailList}>
          {items.map((item) => (
            <WhatsAppRow
              isBusy={isBusy}
              isDisabled={isDisabled}
              item={item}
              key={item.id}
              onRemove={(numberId) => removeMutation.mutate(numberId)}
              onSave={(input) => updateMutation.mutate(input)}
            />
          ))}
        </ul>
      )}
      {actionError !== null && !addMutation.isError ? (
        <p className={styles.error} role="alert">
          {t(`clientWhatsApp.failure.${failureKey(actionError)}`, {
            max: DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE,
          })}
        </p>
      ) : null}
    </section>
  )
}
