/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import {
  buildNfseCredentialSubmission,
  resolveNfseCredentialPresence,
  toNfseCredentialDraft,
  type NfseCredentialBody,
  type NfseCredentialBlockReason,
  type NfseCredentialDraft,
  type NfseCredentialPresence,
} from '@/modules/nfse-invoice/shared/nfseCredentialForm.service'
import {
  NFSE_CREDENTIAL_STATUSES,
  NFSE_FISCAL_ENVIRONMENTS,
  type NfseCredentialStatus,
  type NfseFiscalEnvironment,
  type NfseProviderCredentialSummary,
} from '@/modules/nfse-invoice/shared/nfseSettings.types'
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import styles from '../styles/companySettings.module.css'

type NfseCredentialPanelProps = Readonly<{
  disabled: boolean
  errorCode: string | undefined
  fiscalEnvironment: NfseFiscalEnvironment
  loading: boolean
  onEnvironmentChange: (environment: NfseFiscalEnvironment) => void
  onSave: (body: NfseCredentialBody) => void
  saved: boolean
  summary: NfseProviderCredentialSummary | null | undefined
}>

const BLOCK_REASON_LABEL_KEYS: Readonly<Record<NfseCredentialBlockReason, string>> = {
  apiTokenRequired: 'nfseCredentialBlockedApiTokenRequired',
  taxIdInvalid: 'nfseCredentialBlockedTaxIdInvalid',
}

const ENVIRONMENT_LABEL_KEYS: Readonly<Record<NfseFiscalEnvironment, string>> = {
  homologation: 'nfseFiscalEnvironmentHomologation',
  production: 'nfseFiscalEnvironmentProduction',
}

const STATUS_LABEL_KEYS: Readonly<Record<NfseCredentialStatus, string>> = {
  active: 'nfseCredentialStatusActive',
  inactive: 'nfseCredentialStatusInactive',
}

/** `ready` não tem frase: a credencial que emite não precisa se explicar. */
const PRESENCE_ALERT_KEYS: Readonly<Record<NfseCredentialPresence, null | string>> = {
  absent: 'nfseCredentialAbsent',
  inactive: 'nfseCredentialInactive',
  ready: null,
  tokenMissing: 'nfseCredentialTokenMissing',
}

const TAX_ID_MAX_LENGTH = 18
const MUNICIPAL_REGISTRATION_MAX_LENGTH = 40

function CredentialSkeleton(): JSX.Element {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup label={t('nfseCredentialTitle')}>
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="12rem" />
    </SkeletonGroup>
  )
}

function CredentialSignals({
  environmentLabel,
  presence,
  summary,
}: Readonly<{
  environmentLabel: string
  presence: NfseCredentialPresence
  summary: NfseProviderCredentialSummary | null | undefined
}>): JSX.Element {
  const { t } = useTranslation('companySettings')
  const alertKey = PRESENCE_ALERT_KEYS[presence]

  if (alertKey !== null) {
    return (
      <p className={styles.formStatusError} role="alert">
        {t(alertKey, { environment: environmentLabel })}
      </p>
    )
  }

  return (
    <>
      <p className={styles.fieldHint}>{t('nfseCredentialTokenConfigured')}</p>
      {summary?.callbackTokenConfigured === true && (
        <p className={styles.fieldHint}>{t('nfseCredentialCallbackConfigured')}</p>
      )}
    </>
  )
}

export function NfseCredentialPanel(props: NfseCredentialPanelProps): JSX.Element {
  const { t } = useTranslation('companySettings')
  const [draft, setDraft] = useState<NfseCredentialDraft>(() =>
    toNfseCredentialDraft(props.summary),
  )
  const [blockReason, setBlockReason] = useState<NfseCredentialBlockReason | undefined>(undefined)
  const presence = resolveNfseCredentialPresence(props.summary)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submission = buildNfseCredentialSubmission({
      ...draft,
      fiscalEnvironment: props.fiscalEnvironment,
    })
    if (submission.status === 'blocked') {
      setBlockReason(submission.reason)
      return
    }
    setBlockReason(undefined)
    setDraft({ ...draft, apiToken: '' })
    props.onSave(submission.body)
  }

  return (
    <section className={styles.certificateForm} aria-labelledby="nfse-credential-title">
      <h2 id="nfse-credential-title">{t('nfseCredentialTitle')}</h2>
      <p className={styles.fieldHint}>{t('nfseCredentialHint')}</p>
      {props.loading ? (
        <CredentialSkeleton />
      ) : (
        <form onSubmit={handleSubmit}>
          <CredentialSignals
            environmentLabel={t(ENVIRONMENT_LABEL_KEYS[props.fiscalEnvironment])}
            presence={presence}
            summary={props.summary}
          />
          <div className={styles.fieldGrid}>
            <label>
              <span>{t('nfseCredentialEnvironmentLabel')}</span>
              <Select
                ariaLabel={t('nfseCredentialEnvironmentLabel')}
                disabled={props.disabled}
                onChange={(value) => props.onEnvironmentChange(value as NfseFiscalEnvironment)}
                options={NFSE_FISCAL_ENVIRONMENTS.map((environment) => ({
                  label: t(ENVIRONMENT_LABEL_KEYS[environment]),
                  value: environment,
                }))}
                value={props.fiscalEnvironment}
              />
            </label>
            <label>
              <span>{t('nfseCredentialStatusLabel')}</span>
              <Select
                ariaLabel={t('nfseCredentialStatusLabel')}
                disabled={props.disabled}
                onChange={(value) => setDraft({ ...draft, status: value as NfseCredentialStatus })}
                options={NFSE_CREDENTIAL_STATUSES.map((status) => ({
                  label: t(STATUS_LABEL_KEYS[status]),
                  value: status,
                }))}
                value={draft.status}
              />
            </label>
            <label>
              <span>{t('nfseCredentialTaxIdLabel')}</span>
              <input
                disabled={props.disabled}
                maxLength={TAX_ID_MAX_LENGTH}
                onChange={(event) =>
                  setDraft({ ...draft, taxId: normalizeTaxId(event.target.value) })
                }
                value={draft.taxId}
              />
            </label>
            <label>
              <span>{t('nfseCredentialMunicipalRegistrationLabel')}</span>
              <input
                disabled={props.disabled}
                maxLength={MUNICIPAL_REGISTRATION_MAX_LENGTH}
                onChange={(event) =>
                  setDraft({ ...draft, municipalRegistration: event.target.value })
                }
                value={draft.municipalRegistration}
              />
            </label>
            <label className={styles.fieldWide}>
              <span>{t('nfseCredentialTokenLabel')}</span>
              <input
                autoComplete="off"
                disabled={props.disabled}
                onChange={(event) => setDraft({ ...draft, apiToken: event.target.value })}
                type="password"
                value={draft.apiToken}
              />
            </label>
          </div>
          <p className={styles.fieldHint}>{t('nfseCredentialTokenHint')}</p>
          <button className={styles.primaryAction} disabled={props.disabled} type="submit">
            <Icon name="save" />
            {t('nfseCredentialSave')}
          </button>
        </form>
      )}
      {blockReason !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t(BLOCK_REASON_LABEL_KEYS[blockReason])}
        </p>
      )}
      {props.saved && <p className={styles.formStatusSuccess}>{t('nfseCredentialSaved')}</p>}
      {props.errorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t('nfseCredentialError', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
