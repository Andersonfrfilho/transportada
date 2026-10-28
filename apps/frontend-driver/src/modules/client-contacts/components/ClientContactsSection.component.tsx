/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
  formatClientWhatsAppNumber,
  parseClientWhatsAppNumber,
} from '@/modules/client-whatsapp/shared/clientBoletoWhatsAppNumber.service'
import { useIsOnline } from '@/modules/conversation/hooks/useIsOnline.hook'

import { useClientContacts } from '../hooks/useClientContacts.hook'
import type { ClientContact, ClientContactChannel } from '../shared/clientContacts.types'
import { parseClientEmail } from '../shared/clientContactsRule.service'
import styles from '../styles/clientContacts.module.css'

type ClientContactsSectionProps = Readonly<{
  /** Os canais que o tipo pede (`resolveAskedContactChannels`): um ou dois. */
  channels: readonly ClientContactChannel[]
  documentId: string
}>

type Draft = Readonly<{
  address: string
  channel: ClientContactChannel
  /** Presente na edição: o endereço em claro não vem da API, então vazio é "manter". */
  editing: ClientContact | undefined
  label: string
}>

type Mode =
  | Readonly<{ kind: 'confirm'; draft: Draft; normalized: string }>
  | Readonly<{ kind: 'form'; draft: Draft; showInvalid: boolean }>
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ contactId: string; kind: 'remove' }>

const IDLE: Mode = { kind: 'idle' }

function normalizeAddress(channel: ClientContactChannel, raw: string): null | string {
  return channel === 'whatsapp' ? parseClientWhatsAppNumber(raw) : parseClientEmail(raw)
}

/**
 * Spec 281 T8b (D13): na abertura da ocorrência, os contatos do cliente da nota — vários números e e-mails. O que o
 * escritório cadastrou o motorista só vê (mascarado); o que ele mesmo informou, ele edita e remove. Nada é gravado sem a
 * tela de confirmação, e sem sinal a seção avisa e deixa o registro da ocorrência seguir.
 */
export function ClientContactsSection({ channels, documentId }: ClientContactsSectionProps) {
  const { t } = useTranslation('clientContacts')
  const isOnline = useIsOnline()
  const state = useClientContacts({ documentId, isEnabled: true })
  const [mode, setMode] = useState<Mode>(IDLE)
  const addressId = useId()
  const labelId = useId()
  const visible = state.contacts.filter((contact) => channels.includes(contact.channel))
  const hasNone = !state.isLoading && !state.isUnavailable && visible.length === 0

  function openForm(channel: ClientContactChannel, editing?: ClientContact): void {
    setMode({
      draft: { address: '', channel, editing, label: editing?.label ?? '' },
      kind: 'form',
      showInvalid: false,
    })
  }

  function handleReview(event: FormEvent): void {
    event.preventDefault()
    if (mode.kind !== 'form') return
    const { draft } = mode
    const isKeepingAddress = draft.editing !== undefined && draft.address.trim() === ''
    if (isKeepingAddress) {
      void save(draft, undefined)
      return
    }
    const normalized = normalizeAddress(draft.channel, draft.address)
    if (normalized === null) {
      setMode({ draft, kind: 'form', showInvalid: true })
      return
    }
    setMode({ draft, kind: 'confirm', normalized })
  }

  async function save(draft: Draft, normalized: string | undefined): Promise<void> {
    const label = draft.label.trim()
    const succeeded =
      draft.editing === undefined
        ? await state.add({ address: normalized ?? '', channel: draft.channel, label })
        : await state.update({
            ...(normalized === undefined ? {} : { address: normalized }),
            contactId: draft.editing.contactId,
            label,
          })
    if (succeeded) setMode(IDLE)
  }

  async function confirmRemove(contactId: string): Promise<void> {
    if (await state.remove(contactId)) setMode(IDLE)
  }

  const errorLine =
    state.errorKey === undefined ? null : (
      <p className={styles.error} role="alert">
        {t(`error.${state.errorKey}`)}
      </p>
    )

  return (
    <section aria-label={t('section.title')} className={styles.section}>
      <p className={styles.title}>{t('section.title')}</p>
      {!isOnline || state.isUnavailable ? (
        <p className={styles.note} role="status">
          {t('section.offline')}
        </p>
      ) : state.isLoading ? (
        <p className={styles.note}>{t('section.loading')}</p>
      ) : (
        <>
          {hasNone && mode.kind === 'idle' ? (
            <p className={styles.alert}>{t('section.none')}</p>
          ) : null}
          {visible.length > 0 ? (
            <ul className={styles.list}>
              {visible.map((contact) => (
                <li className={styles.item} key={contact.contactId}>
                  <span className={styles.itemText}>
                    <strong>{contact.addressMasked}</strong>
                    <span className={styles.itemMeta}>
                      {t(`channel.${contact.channel}`)}
                      {contact.label === '' ? '' : ` · ${contact.label}`}
                      {contact.editable ? '' : ` · ${t('section.office')}`}
                    </span>
                  </span>
                  {contact.editable ? (
                    mode.kind === 'remove' && mode.contactId === contact.contactId ? (
                      <span className={styles.itemActions}>
                        <Button
                          disabled={state.isBusy}
                          onClick={() => void confirmRemove(contact.contactId)}
                          type="button"
                          variant="secondary"
                        >
                          {t('remove.confirm')}
                        </Button>
                        <Button onClick={() => setMode(IDLE)} type="button" variant="ghost">
                          {t('remove.keep')}
                        </Button>
                      </span>
                    ) : (
                      <span className={styles.itemActions}>
                        <button
                          aria-label={t('edit.aria', { contact: contact.addressMasked })}
                          className={styles.iconButton}
                          onClick={() => openForm(contact.channel, contact)}
                          type="button"
                        >
                          <Icon aria-hidden="true" name="pen" size="sm" />
                        </button>
                        <button
                          aria-label={t('remove.aria', { contact: contact.addressMasked })}
                          className={styles.iconButton}
                          onClick={() => setMode({ contactId: contact.contactId, kind: 'remove' })}
                          type="button"
                        >
                          <Icon aria-hidden="true" name="trash" size="sm" />
                        </button>
                      </span>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {mode.kind === 'confirm' ? (
            <div className={styles.confirm}>
              <p className={styles.note}>
                {t(mode.draft.channel === 'whatsapp' ? 'confirm.whatsapp' : 'confirm.email')}
              </p>
              <p className={styles.confirmValue} data-testid="client-contact-confirm">
                {mode.draft.channel === 'whatsapp'
                  ? formatClientWhatsAppNumber(mode.normalized)
                  : mode.normalized}
              </p>
              <div className={styles.actions}>
                <Button
                  disabled={state.isBusy}
                  onClick={() => setMode({ draft: mode.draft, kind: 'form', showInvalid: false })}
                  type="button"
                  variant="secondary"
                >
                  {t('confirm.back')}
                </Button>
                <Button
                  aria-busy={state.isBusy}
                  disabled={state.isBusy}
                  onClick={() => void save(mode.draft, mode.normalized)}
                  type="button"
                >
                  <Icon aria-hidden="true" name="check" size="sm" />
                  {state.isBusy ? t('confirm.saving') : t('confirm.save')}
                </Button>
              </div>
            </div>
          ) : mode.kind === 'form' ? (
            <form className={styles.form} noValidate onSubmit={handleReview}>
              {channels.length > 1 && mode.draft.editing === undefined ? (
                <div aria-label={t('form.channel')} className={styles.channels} role="group">
                  {channels.map((channel) => (
                    <button
                      aria-pressed={mode.draft.channel === channel}
                      className={styles.channelButton}
                      key={channel}
                      onClick={() =>
                        setMode({
                          draft: { ...mode.draft, address: '', channel },
                          kind: 'form',
                          showInvalid: false,
                        })
                      }
                      type="button"
                    >
                      {t(`channel.${channel}`)}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className={styles.fieldLabel} htmlFor={addressId}>
                {t(mode.draft.channel === 'whatsapp' ? 'form.whatsapp' : 'form.email')}
              </label>
              <input
                autoComplete="off"
                className={`panel__input ${styles.input}`}
                id={addressId}
                inputMode={mode.draft.channel === 'whatsapp' ? 'tel' : 'email'}
                onChange={(event) =>
                  setMode({
                    draft: { ...mode.draft, address: event.target.value },
                    kind: 'form',
                    showInvalid: false,
                  })
                }
                placeholder={
                  mode.draft.editing === undefined
                    ? t(
                        mode.draft.channel === 'whatsapp'
                          ? 'form.whatsappPlaceholder'
                          : 'form.emailPlaceholder',
                      )
                    : t('form.keepPlaceholder', { contact: mode.draft.editing.addressMasked })
                }
                type={mode.draft.channel === 'whatsapp' ? 'tel' : 'email'}
                value={mode.draft.address}
              />
              {mode.showInvalid ? (
                <p className={styles.error} role="alert">
                  {t(
                    mode.draft.channel === 'whatsapp'
                      ? 'form.invalidWhatsapp'
                      : 'form.invalidEmail',
                  )}
                </p>
              ) : null}
              <label className={styles.fieldLabel} htmlFor={labelId}>
                {t('form.label')}
              </label>
              <input
                autoComplete="off"
                className={`panel__input ${styles.input}`}
                id={labelId}
                maxLength={60}
                onChange={(event) =>
                  setMode({
                    draft: { ...mode.draft, label: event.target.value },
                    kind: 'form',
                    showInvalid: mode.showInvalid,
                  })
                }
                placeholder={t('form.labelPlaceholder')}
                type="text"
                value={mode.draft.label}
              />
              <div className={styles.actions}>
                <Button onClick={() => setMode(IDLE)} type="button" variant="secondary">
                  {t('form.cancel')}
                </Button>
                <Button disabled={state.isBusy} type="submit">
                  {t('form.review')}
                </Button>
              </div>
            </form>
          ) : (
            <div className={styles.addRow}>
              {channels.map((channel) => (
                <Button
                  key={channel}
                  onClick={() => openForm(channel)}
                  type="button"
                  variant={hasNone ? 'default' : 'secondary'}
                >
                  <Icon aria-hidden="true" name="send" size="sm" />
                  {t(`add.${channel}`)}
                </Button>
              ))}
            </div>
          )}
          {errorLine}
        </>
      )}
    </section>
  )
}
