/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  useContractorReplyWhatsAppOptionsQuery,
  useForwardContractorReplyToClientWhatsAppMutation,
} from '../queries/contractorReplyWhatsApp.query'
import {
  createWhatsAppIdempotencyKey,
  describeWhatsAppFailure,
  parseInformedWhatsAppNumber,
  resolveClientWhatsAppAction,
  resolveWhatsAppFailureKey,
  type WhatsAppContactOption,
  type WhatsAppSendOutcome,
} from '../shared/contractorReplyWhatsApp.service'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import styles from '../styles/occurrenceConversation.module.css'

type ClientBoletoWhatsAppActionProps = Readonly<{
  /** Sem ele vale o anexo aceito do retorno (a API resolve). */
  attachmentId?: string
  /** `false` na linha da lista enquanto o boleto não foi aceito: nem consulta a API. */
  isEnabled?: boolean
  occurrenceId: string
  /** `row` é o botão compacto da linha da lista; `page` é o da página e do detalhe da ocorrência. */
  placement: 'page' | 'row'
}>

function newKey(): string {
  return createWhatsAppIdempotencyKey(() => crypto.randomUUID())
}

function failureKeyOf(error: unknown): string {
  return resolveWhatsAppFailureKey(
    error instanceof OccurrenceConversationRequestError ? error.code : '',
  )
}

type ClientBoletoWhatsAppDialogProps = Readonly<{
  attachmentId?: string
  contacts: readonly WhatsAppContactOption[]
  onClose: () => void
  occurrenceId: string
}>

function ClientBoletoWhatsAppDialog({
  attachmentId,
  contacts,
  onClose,
  occurrenceId,
}: ClientBoletoWhatsAppDialogProps) {
  const { t } = useTranslation('occurrenceConversation')
  const baseId = useId()
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const send = useForwardContractorReplyToClientWhatsAppMutation(occurrenceId)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(
    contacts.map((contact) => contact.contactId),
  )
  const [number, setNumber] = useState('')
  const [shouldSave, setShouldSave] = useState(false)
  const [numberErrorKey, setNumberErrorKey] = useState<null | string>(null)
  const [outcome, setOutcome] = useState<null | WhatsAppSendOutcome>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const typed = number.trim()
  const hasChoice = selectedIds.length > 0 || typed !== ''

  function submit(): void {
    const parsed = typed === '' ? undefined : parseInformedWhatsAppNumber(typed)
    if (parsed === null) {
      setNumberErrorKey('numberInvalid')
      return
    }
    setNumberErrorKey(null)
    send.mutate(
      {
        ...(parsed === undefined ? {} : { number: parsed, save: shouldSave }),
        ...(attachmentId === undefined ? {} : { attachmentId }),
        contactIds: selectedIds,
        idempotencyKey,
      },
      {
        onError: (failure) => {
          if (failureKeyOf(failure) === 'numberInvalid') setNumberErrorKey('numberInvalid')
          setIdempotencyKey(newKey())
        },
        onSuccess: (result) => {
          setOutcome(result)
          setIdempotencyKey(newKey())
        },
      },
    )
  }

  const numberId = `${baseId}-number`
  const numberErrorId = `${baseId}-number-error`
  const failed = outcome?.results.filter((result) => result.kind === 'failed') ?? []
  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={`${baseId}-title`}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id={`${baseId}-title`}>{t('clientWhatsApp.title')}</h2>
            <p className={styles.hint}>{t('clientWhatsApp.hint')}</p>
          </div>
          <button
            aria-label={t('clientWhatsApp.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>
        {outcome === null ? (
          <form
            className={styles.panel}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <fieldset className={styles.fieldset} disabled={send.isPending}>
              <legend>{t('clientWhatsApp.saved')}</legend>
              {contacts.length === 0 ? (
                <p className={styles.hint}>{t('clientWhatsApp.noneSaved')}</p>
              ) : (
                contacts.map((contact) => (
                  <div className={styles.recipient} key={contact.contactId}>
                    <Checkbox
                      checked={selectedIds.includes(contact.contactId)}
                      label={contact.numberMasked}
                      onChange={(checked) =>
                        setSelectedIds((current) =>
                          checked
                            ? [...current, contact.contactId]
                            : current.filter((id) => id !== contact.contactId),
                        )
                      }
                    />
                    {contact.label === '' ? null : (
                      <span className={styles.hint}>{contact.label}</span>
                    )}
                  </div>
                ))
              )}
            </fieldset>
            <div className={styles.field}>
              <label htmlFor={numberId}>{t('clientWhatsApp.otherNumber')}</label>
              <input
                aria-describedby={numberErrorKey === null ? undefined : numberErrorId}
                aria-invalid={numberErrorKey !== null}
                autoComplete="off"
                disabled={send.isPending}
                id={numberId}
                inputMode="tel"
                maxLength={100}
                onChange={(event) => {
                  setNumber(event.target.value)
                  setNumberErrorKey(null)
                }}
                placeholder={t('clientWhatsApp.numberPlaceholder')}
                type="text"
                value={number}
              />
              {numberErrorKey === null ? null : (
                <span className={styles.error} id={numberErrorId} role="alert">
                  {t(`clientWhatsApp.failure.${numberErrorKey}`)}
                </span>
              )}
              <Checkbox
                checked={shouldSave}
                disabled={send.isPending || typed === ''}
                label={t('clientWhatsApp.save')}
                onChange={setShouldSave}
              />
            </div>
            {send.isError && numberErrorKey === null ? (
              <p className={styles.error} role="alert">
                {t(`clientWhatsApp.failure.${failureKeyOf(send.error)}`)}
              </p>
            ) : null}
            <div className={styles.footer}>
              <Button onClick={onClose} type="button" variant="ghost">
                {t('clientWhatsApp.cancel')}
              </Button>
              <Button disabled={send.isPending || !hasChoice} type="submit">
                <Icon name="send" size="sm" />
                {send.isPending ? t('clientWhatsApp.sending') : t('clientWhatsApp.send')}
              </Button>
            </div>
          </form>
        ) : (
          <div className={styles.panel}>
            <ul className={styles.replyEmailHistoryList}>
              {outcome.results.map((result) => (
                <li key={result.deliveryId}>
                  <strong>{result.numberMasked}</strong>
                  {` · ${t(`clientWhatsApp.result.${result.kind}`)}`}
                  {result.kind === 'failed'
                    ? ` · ${t(`clientWhatsApp.reason.${describeWhatsAppFailure(result.reason).key}`)}`
                    : ''}
                </li>
              ))}
            </ul>
            {failed.some((result) => describeWhatsAppFailure(result.reason).offerEmail) ? (
              <p className={styles.hint} role="status">
                {t('clientWhatsApp.useEmail')}
              </p>
            ) : null}
            {outcome.savedContactId === null ? null : (
              <p className={styles.hint}>{t('clientWhatsApp.savedNow')}</p>
            )}
            <div className={styles.footer}>
              <Button onClick={onClose} type="button">
                {t('clientWhatsApp.done')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * Spec 281 T7 (RF3/RF5): o botão "Enviar por WhatsApp" da ocorrência, ao lado do "Enviar ao cliente" por e-mail. O
 * tipo manda (`whatsapp` ou `both` mostram o botão). Com o Evolution desligado ou desconectado o botão fica à vista,
 * desligado e com o motivo; o e-mail segue disponível ao lado. O número digitado vai só no corpo e pode ser guardado
 * no cadastro do cliente; os guardados são escolhidos por `contactId` e chegam mascarados.
 */
export function ClientBoletoWhatsAppAction({
  attachmentId,
  isEnabled = true,
  occurrenceId,
  placement,
}: ClientBoletoWhatsAppActionProps) {
  const { t } = useTranslation('occurrenceConversation')
  const reasonId = useId()
  const options = useContractorReplyWhatsAppOptionsQuery({ enabled: isEnabled, occurrenceId }).data
  const [isOpen, setOpen] = useState(false)
  if (!isEnabled || options === null || options === undefined) return null
  const action = resolveClientWhatsAppAction(options)
  if (action.kind === 'hidden') return null
  const blockedKey =
    action.kind === 'offline'
      ? `clientWhatsApp.offline.${action.reason}`
      : action.kind === 'limitReached'
        ? 'clientWhatsApp.limitReached'
        : null

  return (
    <>
      <Tooltip label={blockedKey === null || placement === 'page' ? '' : t(blockedKey)}>
        <Button
          aria-describedby={blockedKey === null || placement === 'row' ? undefined : reasonId}
          aria-haspopup="dialog"
          className={placement === 'row' ? styles.clientEmailRowButton : undefined}
          disabled={blockedKey !== null}
          onClick={() => setOpen(true)}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="send" size="sm" />
          {t('clientWhatsApp.open')}
        </Button>
      </Tooltip>
      {blockedKey !== null && placement === 'page' ? (
        <span className={styles.hint} id={reasonId}>
          {t(blockedKey)}
        </span>
      ) : null}
      {isOpen ? (
        <ClientBoletoWhatsAppDialog
          {...(attachmentId === undefined ? {} : { attachmentId })}
          contacts={options.contacts}
          occurrenceId={occurrenceId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
