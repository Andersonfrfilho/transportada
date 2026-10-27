/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  useContractorReplyEmailOptionsQuery,
  useForwardContractorReplyToClientMutation,
} from '../queries/contractorReplyEmail.query'
import {
  CONTRACTOR_REPLY_EMAIL_ERROR,
  createClientEmailIdempotencyKey,
  parseInformedAddress,
  resolveClientEmailAction,
  resolveEmailFailureKey,
  type ClientEmailOption,
  type ClientEmailSendOutcome,
} from '../shared/contractorReplyEmail.service'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import styles from '../styles/occurrenceConversation.module.css'

type ClientBoletoEmailActionProps = Readonly<{
  /** Sem ele vale o anexo aceito do retorno (a API resolve). */
  attachmentId?: string
  /** `false` na linha da lista enquanto o boleto não foi aceito: nem consulta a API. */
  isEnabled?: boolean
  occurrenceId: string
  /** `row` é o botão compacto da linha da lista; `page` é o da página e do detalhe da ocorrência. */
  placement: 'page' | 'row'
}>

function newKey(): string {
  return createClientEmailIdempotencyKey(() => crypto.randomUUID())
}

function failureKeyOf(error: unknown): string {
  const code = error instanceof OccurrenceConversationRequestError ? error.code : ''
  if (code === 'OCCURRENCE_CLIENT_EMAIL_OFF') return 'off'
  if (code === 'DELIVERY_CLIENT_EMAIL_LIMIT_REACHED') return 'registryLimit'
  if (code === 'DELIVERY_CLIENT_EMAIL_NOT_FOUND') return 'emailGone'
  return resolveEmailFailureKey(code)
}

type ClientBoletoEmailDialogProps = Readonly<{
  attachmentId?: string
  emails: readonly ClientEmailOption[]
  onClose: () => void
  occurrenceId: string
}>

function ClientBoletoEmailDialog({
  attachmentId,
  emails,
  onClose,
  occurrenceId,
}: ClientBoletoEmailDialogProps) {
  const { t } = useTranslation('occurrenceConversation')
  const baseId = useId()
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: true, onClose })
  const send = useForwardContractorReplyToClientMutation(occurrenceId)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(emails.map((e) => e.emailId))
  const [address, setAddress] = useState('')
  const [shouldSave, setShouldSave] = useState(false)
  const [addressErrorKey, setAddressErrorKey] = useState<null | string>(null)
  const [outcome, setOutcome] = useState<ClientEmailSendOutcome | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState(newKey)
  const typed = address.trim()
  const hasChoice = selectedIds.length > 0 || typed !== ''

  function submit(): void {
    const parsed = typed === '' ? undefined : parseInformedAddress(typed)
    if (parsed === null) {
      setAddressErrorKey('addressInvalid')
      return
    }
    setAddressErrorKey(null)
    send.mutate(
      {
        ...(parsed === undefined ? {} : { address: parsed, save: shouldSave }),
        ...(attachmentId === undefined ? {} : { attachmentId }),
        emailIds: selectedIds,
        idempotencyKey,
      },
      {
        onError: (failure) => {
          if (
            failure instanceof OccurrenceConversationRequestError &&
            failure.code === CONTRACTOR_REPLY_EMAIL_ERROR.ADDRESS_INVALID
          ) {
            setAddressErrorKey('addressInvalid')
          }
          setIdempotencyKey(newKey())
        },
        onSuccess: (result) => {
          setOutcome(result)
          setIdempotencyKey(newKey())
        },
      },
    )
  }

  const addressId = `${baseId}-address`
  const addressErrorId = `${baseId}-address-error`
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
            <h2 id={`${baseId}-title`}>{t('clientEmail.title')}</h2>
            <p className={styles.hint}>{t('clientEmail.hint')}</p>
          </div>
          <button
            aria-label={t('clientEmail.close')}
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
              <legend>{t('clientEmail.saved')}</legend>
              {emails.length === 0 ? (
                <p className={styles.hint}>{t('clientEmail.noneSaved')}</p>
              ) : (
                emails.map((email) => (
                  <div className={styles.recipient} key={email.emailId}>
                    <Checkbox
                      checked={selectedIds.includes(email.emailId)}
                      label={email.addressMasked}
                      onChange={(checked) =>
                        setSelectedIds((current) =>
                          checked
                            ? [...current, email.emailId]
                            : current.filter((id) => id !== email.emailId),
                        )
                      }
                    />
                    {email.label === '' ? null : <span className={styles.hint}>{email.label}</span>}
                  </div>
                ))
              )}
            </fieldset>
            <div className={styles.field}>
              <label htmlFor={addressId}>{t('clientEmail.otherAddress')}</label>
              <input
                aria-describedby={addressErrorKey === null ? undefined : addressErrorId}
                aria-invalid={addressErrorKey !== null}
                autoComplete="off"
                disabled={send.isPending}
                id={addressId}
                inputMode="email"
                maxLength={254}
                onChange={(event) => {
                  setAddress(event.target.value)
                  setAddressErrorKey(null)
                }}
                type="text"
                value={address}
              />
              {addressErrorKey === null ? null : (
                <span className={styles.error} id={addressErrorId} role="alert">
                  {t(`replyEmail.failure.${addressErrorKey}`)}
                </span>
              )}
              <Checkbox
                checked={shouldSave}
                disabled={send.isPending || typed === ''}
                label={t('clientEmail.save')}
                onChange={setShouldSave}
              />
            </div>
            {send.isError && addressErrorKey === null ? (
              <p className={styles.error} role="alert">
                {t(`clientEmail.failure.${failureKeyOf(send.error)}`, {
                  defaultValue: t('replyEmail.failure.generic'),
                })}
              </p>
            ) : null}
            <div className={styles.footer}>
              <Button onClick={onClose} type="button" variant="ghost">
                {t('clientEmail.cancel')}
              </Button>
              <Button disabled={send.isPending || !hasChoice} type="submit">
                <Icon name="send" size="sm" />
                {send.isPending ? t('clientEmail.sending') : t('clientEmail.send')}
              </Button>
            </div>
          </form>
        ) : (
          <div className={styles.panel}>
            <ul className={styles.replyEmailHistoryList}>
              {outcome.results.map((result) => (
                <li key={`${result.addressMasked}-${result.kind}`}>
                  <strong>{result.addressMasked}</strong>
                  {` · ${t(`clientEmail.result.${result.kind}`)}`}
                </li>
              ))}
            </ul>
            {outcome.savedEmailId === null ? null : (
              <p className={styles.hint}>{t('clientEmail.savedNow')}</p>
            )}
            <div className={styles.footer}>
              <Button onClick={onClose} type="button">
                {t('clientEmail.done')}
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
 * Spec 279 RF5/RF9/RF11 (T5): o botão "Enviar ao cliente" da ocorrência — na linha da lista e na página. O tipo da
 * ocorrência manda (`off` esconde); com e-mail guardado o operador marca quais, sem nenhum o botão vira
 * "Adicionar e-mail" (D6: o escritório nunca fica travado). Escolhe por `emailId`; o endereço digitado vai só no
 * corpo e pode ser guardado no cadastro do cliente.
 */
export function ClientBoletoEmailAction({
  attachmentId,
  isEnabled = true,
  occurrenceId,
  placement,
}: ClientBoletoEmailActionProps) {
  const { t } = useTranslation('occurrenceConversation')
  const options = useContractorReplyEmailOptionsQuery({ enabled: isEnabled, occurrenceId }).data
  const [isOpen, setOpen] = useState(false)
  if (!isEnabled || options === null || options === undefined) return null
  const action = resolveClientEmailAction(options)
  if (action.kind === 'hidden') return null

  return (
    <>
      <Button
        aria-haspopup="dialog"
        className={placement === 'row' ? styles.clientEmailRowButton : undefined}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name={action.kind === 'add' ? 'add' : 'send'} size="sm" />
        {action.kind === 'add' ? t('clientEmail.add') : t('clientEmail.open')}
      </Button>
      {isOpen ? (
        <ClientBoletoEmailDialog
          {...(attachmentId === undefined ? {} : { attachmentId })}
          emails={options.clientEmails}
          occurrenceId={occurrenceId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
