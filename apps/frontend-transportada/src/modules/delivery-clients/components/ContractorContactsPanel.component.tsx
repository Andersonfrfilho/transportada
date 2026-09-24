/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type JSX, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useContractorContacts } from '../hooks/useContractorContacts.hook'
import { ContractorContactsRequestError } from '../shared/contractorContactsClient.service'
import {
  CONTRACTOR_CONTACT_OCCURRENCE_STAGES,
  CONTRACTOR_CONTACT_TYPES,
  type ContractorContact,
  type ContractorContactChannel,
} from '../shared/contractorContacts.types'
import {
  buildContractorContactPayload,
  contractorContactDraftFromContact,
  EMPTY_CONTRACTOR_CONTACT_DRAFT,
  formatContractorContactPhone,
  normalizeContractorContactPhone,
  toggleContractorContactOption,
  validateContractorContactDraft,
  type ContractorContactDraft,
  type ContractorContactPayload,
} from '../shared/contractorContacts.validation'
import styles from '../styles/deliveryClients.module.css'

type ContractorContactsPanelProps = Readonly<{ isDisabled: boolean }>

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

function toErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

/** `web.md` §11: o 409 `CONTRACTOR_CONTACT_EMAIL_TAKEN` sempre traz `details.email`. */
function toEmailErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ContractorContactsRequestError)) return undefined
  return error.details.get('email')
}

type ContactFormProps = Readonly<{
  error: unknown
  initialDraft: ContractorContactDraft
  isBusy: boolean
  mode: 'create' | 'edit'
  onCancel?: () => void
  onSubmit: (payload: ContractorContactPayload, reset: () => void) => void
  panelRef?: RefObject<HTMLFormElement | null>
  /** O aceite já gravado: a API guarda o carimbo original enquanto o número for o mesmo (T302). */
  recordedOptIn?: Readonly<{ at: string; phone: string }>
}>

/**
 * Spec 183 T303 (P3): o formulário do contato — nome, setor, e-mail, telefone, tipos, grupos de
 * ocorrência, o aceite do WhatsApp e o canal preferido. As regras da política da API (T302) aparecem
 * no campo antes do envio; a API continua sendo a última palavra.
 */
/** Spec 183 T407: também serve ao "Adicionar aos contatos" da conversa, já preenchido (RF16). */
export function ContactForm({
  error,
  initialDraft,
  isBusy,
  mode,
  onCancel,
  onSubmit,
  panelRef,
  recordedOptIn,
}: ContactFormProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const [draft, setDraft] = useState<ContractorContactDraft>(initialDraft)
  const [submitted, setSubmitted] = useState(false)
  const errors = submitted ? validateContractorContactDraft(draft) : {}
  const emailServerError = toEmailErrorMessage(error)
  const typedPhone = normalizeContractorContactPhone(draft.phone) ?? null
  const hasPhone = typedPhone !== null
  const keepsRecordedOptIn =
    recordedOptIn !== undefined && draft.whatsappOptIn && typedPhone === recordedOptIn.phone
  const idPrefix = `contractor-contact-${mode}`

  function update(changes: Partial<ContractorContactDraft>): void {
    setDraft((current) => {
      const next = { ...current, ...changes }
      /** Sem aceite não há WhatsApp preferido: a tela desfaz o par junto, como a API exige. */
      return next.whatsappOptIn ? next : { ...next, preferredChannel: 'email' }
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setSubmitted(true)
    const payload = buildContractorContactPayload(draft)
    if (payload === undefined) return
    onSubmit(payload, () => {
      setDraft(EMPTY_CONTRACTOR_CONTACT_DRAFT)
      setSubmitted(false)
    })
  }

  const channelOptions: readonly Readonly<{ label: string; value: ContractorContactChannel }>[] = [
    { label: t('contractorContacts.channel.email'), value: 'email' },
    ...(draft.whatsappOptIn
      ? [{ label: t('contractorContacts.channel.whatsapp'), value: 'whatsapp' as const }]
      : []),
  ]

  return (
    <form
      aria-labelledby={`${idPrefix}-title`}
      className={styles.contactForm}
      noValidate
      onSubmit={handleSubmit}
      ref={panelRef}
    >
      <h3 id={`${idPrefix}-title`}>
        {mode === 'create' ? t('contractorContacts.newTitle') : t('contractorContacts.editTitle')}
      </h3>
      <div className={styles.contactFields}>
        <label className={styles.field}>
          <span>{t('contractorContacts.nameLabel')}</span>
          <input
            autoComplete="off"
            disabled={isBusy}
            onChange={(event) => update({ name: event.target.value })}
            value={draft.name}
          />
        </label>
        <label className={styles.field}>
          <span>{t('contractorContacts.roleLabel')}</span>
          <input
            autoComplete="off"
            disabled={isBusy}
            onChange={(event) => update({ roleLabel: event.target.value })}
            placeholder={t('contractorContacts.rolePlaceholder')}
            value={draft.roleLabel}
          />
        </label>
        <label className={styles.field}>
          <span>{t('contractorContacts.emailLabel')}</span>
          <input
            aria-invalid={errors.email !== undefined || emailServerError !== undefined}
            autoComplete="off"
            disabled={isBusy}
            onChange={(event) => update({ email: event.target.value })}
            type="email"
            value={draft.email}
          />
          {errors.email === undefined ? null : (
            <p className={styles.error} role="alert">
              {t(`contractorContacts.errors.${errors.email}`)}
            </p>
          )}
          {errors.email === undefined && emailServerError !== undefined ? (
            <p className={styles.error} role="alert">
              {emailServerError}
            </p>
          ) : null}
        </label>
        <label className={styles.field}>
          <span>{t('contractorContacts.phoneLabel')}</span>
          <input
            aria-invalid={errors.phone !== undefined}
            autoComplete="off"
            disabled={isBusy}
            inputMode="tel"
            onChange={(event) => {
              const phone = event.target.value
              update(phone.trim() === '' ? { phone, whatsappOptIn: false } : { phone })
            }}
            placeholder={t('contractorContacts.phonePlaceholder')}
            type="tel"
            value={draft.phone}
          />
          {errors.phone === undefined ? null : (
            <p className={styles.error} role="alert">
              {t(`contractorContacts.errors.${errors.phone}`)}
            </p>
          )}
        </label>
      </div>

      <fieldset className={styles.contactOptions}>
        <legend>{t('contractorContacts.typesLegend')}</legend>
        {CONTRACTOR_CONTACT_TYPES.map((type) => (
          <Checkbox
            checked={draft.types.includes(type)}
            disabled={isBusy}
            key={type}
            label={t(`contractorContacts.types.${type}`)}
            onChange={() =>
              update({
                types: toggleContractorContactOption(draft.types, type, CONTRACTOR_CONTACT_TYPES),
              })
            }
          />
        ))}
      </fieldset>

      {draft.types.includes('occurrences') ? (
        <fieldset className={styles.contactOptions}>
          <legend>{t('contractorContacts.stagesLegend')}</legend>
          {CONTRACTOR_CONTACT_OCCURRENCE_STAGES.map((stage) => (
            <Checkbox
              checked={draft.occurrenceStages.includes(stage)}
              disabled={isBusy}
              key={stage}
              label={t(`contractorContacts.stages.${stage}`)}
              onChange={() =>
                update({
                  occurrenceStages: toggleContractorContactOption(
                    draft.occurrenceStages,
                    stage,
                    CONTRACTOR_CONTACT_OCCURRENCE_STAGES,
                  ),
                })
              }
            />
          ))}
          {errors.occurrenceStages === undefined ? null : (
            <p className={styles.error} role="alert">
              {t(`contractorContacts.errors.${errors.occurrenceStages}`)}
            </p>
          )}
        </fieldset>
      ) : null}

      <fieldset className={styles.contactOptions}>
        <legend>{t('contractorContacts.channelsLegend')}</legend>
        <Checkbox
          checked={draft.whatsappOptIn}
          disabled={isBusy || !hasPhone}
          label={t('contractorContacts.optInLabel')}
          onChange={(checked) => update({ whatsappOptIn: checked })}
        />
        <p className={styles.hint}>
          {!hasPhone
            ? t('contractorContacts.optInNeedsPhone')
            : keepsRecordedOptIn
              ? t('contractorContacts.optInRecorded', {
                  date: dateFormatter.format(new Date(recordedOptIn.at)),
                })
              : t('contractorContacts.optInHint')}
        </p>
        {errors.whatsappOptIn === undefined ? null : (
          <p className={styles.error} role="alert">
            {t(`contractorContacts.errors.${errors.whatsappOptIn}`)}
          </p>
        )}
        <label className={styles.field}>
          <span>{t('contractorContacts.preferredChannelLabel')}</span>
          <Select
            ariaLabel={t('contractorContacts.preferredChannelLabel')}
            disabled={isBusy}
            onChange={(value) =>
              update({ preferredChannel: value === 'whatsapp' ? 'whatsapp' : 'email' })
            }
            options={channelOptions}
            value={draft.preferredChannel}
          />
        </label>
      </fieldset>

      <div className={styles.contactActions}>
        <Button disabled={isBusy} type="submit">
          <Icon name={mode === 'create' ? 'add' : 'save'} />
          {mode === 'create' ? t('contractorContacts.add') : t('contractorContacts.save')}
        </Button>
        {onCancel === undefined ? null : (
          <Button disabled={isBusy} onClick={onCancel} type="button" variant="ghost">
            {t('contractorContacts.cancel')}
          </Button>
        )}
      </div>

      {error !== null && emailServerError === undefined && toErrorCode(error) !== undefined ? (
        <p className={styles.error} role="alert">
          {t('contractorContacts.error', { code: toErrorCode(error) })}
        </p>
      ) : null}
    </form>
  )
}

/** A edição nasce pelo clique em "Editar": rola até o formulário e foca (`docs/frontend/panels.md`). */
function EditContactForm(props: Omit<ContactFormProps, 'mode' | 'panelRef'>): JSX.Element {
  const { panelRef } = useRevealedPanel<HTMLFormElement>()
  return <ContactForm {...props} mode="edit" panelRef={panelRef} />
}

function ContactCard({
  contact,
  isBusy,
  onEdit,
  onToggleStatus,
}: Readonly<{
  contact: ContractorContact
  isBusy: boolean
  onEdit: () => void
  onToggleStatus: () => void
}>): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const title = contact.name === '' ? contact.email : contact.name
  const phone = formatContractorContactPhone(contact.phone)

  return (
    <li className={styles.contactCard}>
      <div className={styles.contactCardHeader}>
        <div>
          <p className={styles.contactName}>{title}</p>
          {contact.roleLabel === '' ? null : <p className={styles.hint}>{contact.roleLabel}</p>}
        </div>
        <Badge variant={contact.status === 'active' ? 'success' : 'secondary'}>
          {contact.status === 'active'
            ? t('contractorContacts.statusActive')
            : t('contractorContacts.statusInactive')}
        </Badge>
      </div>
      <dl className={styles.contactFacts}>
        {contact.name === '' ? null : (
          <div>
            <dt>{t('contractorContacts.emailLabel')}</dt>
            <dd>{contact.email}</dd>
          </div>
        )}
        <div>
          <dt>{t('contractorContacts.phoneLabel')}</dt>
          <dd>
            {phone === '' ? t('contractorContacts.noPhone') : phone}
            {contact.whatsappOptInAt === null ? null : (
              <Badge variant="success">
                {t('contractorContacts.optInSince', {
                  date: dateFormatter.format(new Date(contact.whatsappOptInAt)),
                })}
              </Badge>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('contractorContacts.preferredChannelLabel')}</dt>
          <dd>{t(`contractorContacts.channel.${contact.preferredChannel}`)}</dd>
        </div>
      </dl>
      <ul aria-label={t('contractorContacts.typesLegend')} className={styles.contactChips}>
        {contact.types.length === 0 ? (
          <li className={styles.hint}>{t('contractorContacts.noTypes')}</li>
        ) : (
          contact.types.map((type) => (
            <li key={type}>
              <Badge variant="secondary">{t(`contractorContacts.types.${type}`)}</Badge>
            </li>
          ))
        )}
      </ul>
      {contact.types.includes('occurrences') ? (
        <p className={styles.hint}>
          {t('contractorContacts.stagesSummary', {
            stages: contact.occurrenceStages
              .map((stage) => t(`contractorContacts.stages.${stage}`))
              .join(', '),
          })}
        </p>
      ) : null}
      <div className={styles.contactActions}>
        <Button disabled={isBusy} onClick={onEdit} size="sm" type="button" variant="secondary">
          <Icon name="edit" />
          {t('contractorContacts.edit')}
        </Button>
        <Button disabled={isBusy} onClick={onToggleStatus} size="sm" type="button" variant="ghost">
          <Icon name={contact.status === 'active' ? 'trash' : 'refresh'} />
          {contact.status === 'active'
            ? t('contractorContacts.deactivate')
            : t('contractorContacts.reactivate')}
        </Button>
      </div>
    </li>
  )
}

/**
 * Spec 150 T301 (spec 143 T017), refeito na spec 183 T303 (P3): os contatos da contratante, dentro
 * do módulo onde as contratantes já são resolvidas (spec 143 T011). Sem `DELETE` na tela —
 * desativar é o mesmo botão de reativar, trocando só o `status` (a trilha de mensagens aponta para o
 * contato).
 */
export function ContractorContactsPanel({ isDisabled }: ContractorContactsPanelProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const [contractorId, setContractorId] = useState<string | undefined>(undefined)
  const [editingContactId, setEditingContactId] = useState<string | undefined>(undefined)
  const { contactsQuery, contractorsQuery, createMutation, updateMutation } = useContractorContacts(
    { contractorId, enabled: true },
  )

  const contractors = contractorsQuery.data ?? []
  const contacts = contactsQuery.data ?? []
  const isBusy = isDisabled || createMutation.isPending || updateMutation.isPending

  return (
    <section aria-labelledby="contractor-contacts-title" className={styles.form}>
      <h2 id="contractor-contacts-title">{t('contractorContacts.title')}</h2>
      <p className={styles.hint}>{t('contractorContacts.hint')}</p>

      <label className={styles.field}>
        <span>{t('contractorContacts.contractorLabel')}</span>
        <Select
          ariaLabel={t('contractorContacts.contractorLabel')}
          disabled={isDisabled || contractorsQuery.isLoading}
          onChange={(value) => {
            setContractorId(value === '' ? undefined : value)
            setEditingContactId(undefined)
          }}
          options={contractors.map((contractor) => ({
            label: `${contractor.displayName === '' ? contractor.taxId : contractor.displayName}`,
            value: contractor.id,
          }))}
          placeholder={t('contractorContacts.contractorPlaceholder')}
          value={contractorId ?? ''}
        />
      </label>

      {contractorId === undefined ? null : contactsQuery.isLoading ? (
        <SkeletonGroup label={t('contractorContacts.loading')}>
          <Skeleton height="7rem" width="100%" />
          <Skeleton height="7rem" width="100%" />
        </SkeletonGroup>
      ) : (
        <>
          <ul className={styles.contactList}>
            {contacts.map((contact) =>
              contact.id === editingContactId ? (
                <li className={styles.contactEditing} key={contact.id}>
                  <EditContactForm
                    error={updateMutation.error ?? null}
                    initialDraft={contractorContactDraftFromContact(contact)}
                    {...(contact.whatsappOptInAt === null || contact.phone === null
                      ? {}
                      : { recordedOptIn: { at: contact.whatsappOptInAt, phone: contact.phone } })}
                    isBusy={isBusy}
                    onCancel={() => setEditingContactId(undefined)}
                    onSubmit={(payload) =>
                      updateMutation.mutate(
                        { body: payload, contactId: contact.id },
                        { onSuccess: () => setEditingContactId(undefined) },
                      )
                    }
                  />
                </li>
              ) : (
                <ContactCard
                  contact={contact}
                  isBusy={isBusy}
                  key={contact.id}
                  onEdit={() => setEditingContactId(contact.id)}
                  onToggleStatus={() =>
                    updateMutation.mutate({
                      body: { status: contact.status === 'active' ? 'inactive' : 'active' },
                      contactId: contact.id,
                    })
                  }
                />
              ),
            )}
            {contacts.length === 0 && (
              <li className={styles.hint}>{t('contractorContacts.empty')}</li>
            )}
          </ul>

          <ContactForm
            error={createMutation.error ?? null}
            initialDraft={EMPTY_CONTRACTOR_CONTACT_DRAFT}
            isBusy={isBusy}
            key={contractorId}
            mode="create"
            onSubmit={(payload, reset) => createMutation.mutate(payload, { onSuccess: reset })}
          />
        </>
      )}
    </section>
  )
}
