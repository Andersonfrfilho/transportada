/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useContractorContacts } from '../hooks/useContractorContacts.hook'
import {
  ContractorContactsRequestError,
  type ContractorContactUpdateBody,
} from '../shared/contractorContactsClient.service'
import {
  buildContractorContactSubmission,
  CONTRACTOR_CONTACT_VALIDATION_ERROR,
  validateContractorContactEmail,
  type ContractorContactDraft,
} from '../shared/contractorContacts.validation'
import type { ContractorContact } from '../shared/contractorContacts.types'
import styles from '../styles/deliveryClients.module.css'

const EMPTY_DRAFT: ContractorContactDraft = {
  canDecide: false,
  email: '',
  receivesOccurrences: true,
}

type ContractorContactsPanelProps = Readonly<{ isDisabled: boolean }>

function toErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

/** `web.md` §11: o 409 `CONTRACTOR_CONTACT_EMAIL_TAKEN` sempre traz `details.email`. */
function toEmailErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof ContractorContactsRequestError)) return undefined
  return error.details.get('email')
}

/**
 * Spec 150 T301 (spec 143 T017): os contatos de e-mail da contratante, dentro do módulo onde as
 * contratantes já são resolvidas (spec 143 T011). Sem `DELETE` na tela — desativar é o mesmo botão
 * de reativar, trocando só o `status` (RF do backend: a trilha de mensagens aponta para o contato).
 */
export function ContractorContactsPanel({ isDisabled }: ContractorContactsPanelProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const [contractorId, setContractorId] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState<ContractorContactDraft>(EMPTY_DRAFT)
  const [touchedEmail, setTouchedEmail] = useState(false)
  const { contactsQuery, contractorsQuery, createMutation, updateMutation } = useContractorContacts(
    { contractorId, enabled: true },
  )

  const contractors = contractorsQuery.data ?? []
  const contacts = contactsQuery.data ?? []
  const emailValidationError = touchedEmail
    ? validateContractorContactEmail(draft.email)
    : undefined
  const emailServerError = toEmailErrorMessage(createMutation.error)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setTouchedEmail(true)
    const submission = buildContractorContactSubmission(draft)
    if (submission === undefined) return
    createMutation.mutate(submission, {
      onSuccess: () => {
        setDraft(EMPTY_DRAFT)
        setTouchedEmail(false)
      },
    })
  }

  function handleToggleStatus(contact: ContractorContact): void {
    const body: ContractorContactUpdateBody = {
      status: contact.status === 'active' ? 'inactive' : 'active',
    }
    updateMutation.mutate({ body, contactId: contact.id })
  }

  function handleToggleReceivesOccurrences(contact: ContractorContact): void {
    updateMutation.mutate({
      body: { receivesOccurrences: !contact.receivesOccurrences },
      contactId: contact.id,
    })
  }

  function handleToggleCanDecide(contact: ContractorContact): void {
    updateMutation.mutate({ body: { canDecide: !contact.canDecide }, contactId: contact.id })
  }

  return (
    <section aria-labelledby="contractor-contacts-title" className={styles.form}>
      <h2 id="contractor-contacts-title">{t('contractorContacts.title')}</h2>
      <p className={styles.hint}>{t('contractorContacts.hint')}</p>

      <label className={styles.field}>
        <span>{t('contractorContacts.contractorLabel')}</span>
        <Select
          ariaLabel={t('contractorContacts.contractorLabel')}
          disabled={isDisabled || contractorsQuery.isLoading}
          onChange={(value) => setContractorId(value === '' ? undefined : value)}
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
          <Skeleton height="2.5rem" width="100%" />
          <Skeleton height="2.5rem" width="100%" />
        </SkeletonGroup>
      ) : (
        <>
          <ul className={styles.weekdayList}>
            {contacts.map((contact) => (
              <li className={styles.weekday} key={contact.id}>
                <div className={styles.weekdayHeader}>
                  <span>{contact.email}</span>
                  <span>
                    {contact.status === 'active'
                      ? t('contractorContacts.statusActive')
                      : t('contractorContacts.statusInactive')}
                  </span>
                </div>
                <div className={styles.windowRow}>
                  <Checkbox
                    checked={contact.receivesOccurrences}
                    disabled={isDisabled || updateMutation.isPending}
                    label={t('contractorContacts.receivesOccurrences')}
                    onChange={() => handleToggleReceivesOccurrences(contact)}
                  />
                  <Checkbox
                    checked={contact.canDecide}
                    disabled={isDisabled || updateMutation.isPending}
                    label={t('contractorContacts.canDecide')}
                    onChange={() => handleToggleCanDecide(contact)}
                  />
                  <button
                    disabled={isDisabled || updateMutation.isPending}
                    onClick={() => handleToggleStatus(contact)}
                    type="button"
                  >
                    <Icon name={contact.status === 'active' ? 'trash' : 'refresh'} />
                    {contact.status === 'active'
                      ? t('contractorContacts.deactivate')
                      : t('contractorContacts.reactivate')}
                  </button>
                </div>
              </li>
            ))}
            {contacts.length === 0 && <li>{t('contractorContacts.empty')}</li>}
          </ul>

          <form className={styles.windowRow} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>{t('contractorContacts.emailLabel')}</span>
              <input
                aria-invalid={emailValidationError !== undefined || emailServerError !== undefined}
                disabled={isDisabled || createMutation.isPending}
                onBlur={() => setTouchedEmail(true)}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                type="email"
                value={draft.email}
              />
              {emailValidationError === CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_REQUIRED && (
                <p className={styles.error} role="alert">
                  {t('contractorContacts.emailRequired')}
                </p>
              )}
              {emailValidationError === CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_INVALID && (
                <p className={styles.error} role="alert">
                  {t('contractorContacts.emailInvalid')}
                </p>
              )}
              {emailValidationError === undefined && emailServerError !== undefined && (
                <p className={styles.error} role="alert">
                  {emailServerError}
                </p>
              )}
            </label>
            <Checkbox
              checked={draft.receivesOccurrences}
              disabled={isDisabled || createMutation.isPending}
              label={t('contractorContacts.receivesOccurrences')}
              onChange={(checked) => setDraft({ ...draft, receivesOccurrences: checked })}
            />
            <Checkbox
              checked={draft.canDecide}
              disabled={isDisabled || createMutation.isPending}
              label={t('contractorContacts.canDecide')}
              onChange={(checked) => setDraft({ ...draft, canDecide: checked })}
            />
            <button disabled={isDisabled || createMutation.isPending} type="submit">
              <Icon name="add" />
              {t('contractorContacts.add')}
            </button>
          </form>

          {createMutation.error !== undefined &&
            emailServerError === undefined &&
            toErrorCode(createMutation.error) !== undefined && (
              <p className={styles.error} role="alert">
                {t('contractorContacts.error', { code: toErrorCode(createMutation.error) })}
              </p>
            )}
        </>
      )}
    </section>
  )
}
