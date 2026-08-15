/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { FreightRuleSummary } from '@/modules/freight/shared/freightClient.service'
import {
  buildNfseProfileSubmission,
  EMPTY_NFSE_PROFILE_DRAFT,
  toNfseProfileDraft,
  type NfseProfileBlockReason,
  type NfseProfileDraft,
} from '@/modules/nfse-invoice/shared/nfseProfileForm.service'
import type {
  NfseEmissionProfile,
  NfseEmissionProfileStatus,
} from '@/modules/nfse-invoice/shared/nfseSettings.types'

import type { NfseProfileSave, NfseProfileStatusToggle } from '../hooks/useNfseSettings.hook'
import { NfseProfileFields } from './NfseProfileFields.component'
import styles from '../styles/companySettings.module.css'

type NfseEmissionProfilePanelProps = Readonly<{
  disabled: boolean
  errorCode: string | undefined
  freightRules: readonly FreightRuleSummary[]
  loading: boolean
  onSave: (save: NfseProfileSave) => void
  onStatusChange: (toggle: NfseProfileStatusToggle) => void
  profiles: readonly NfseEmissionProfile[]
  saved: boolean
}>

const NEW_PROFILE_VALUE = ''

const PROFILE_STATUS_LABEL_KEYS: Readonly<Record<NfseEmissionProfileStatus, string>> = {
  active: 'nfseProfileStatusActive',
  draft: 'nfseProfileStatusDraft',
  inactive: 'nfseProfileStatusInactive',
}

const BLOCK_REASON_LABEL_KEYS: Readonly<Record<NfseProfileBlockReason, string>> = {
  cnaeInvalid: 'nfseProfileBlockedCnaeInvalid',
  descriptionMaxLengthInvalid: 'nfseProfileBlockedDescriptionMaxLengthInvalid',
  descriptionTemplateRequired: 'nfseProfileBlockedDescriptionTemplateRequired',
  freightRuleRequired: 'nfseProfileBlockedFreightRuleRequired',
  issRateInvalid: 'nfseProfileBlockedIssRateInvalid',
  municipalityInvalid: 'nfseProfileBlockedMunicipalityInvalid',
  nameRequired: 'nfseProfileBlockedNameRequired',
  serviceListItemRequired: 'nfseProfileBlockedServiceListItemRequired',
}

function ProfileSkeleton(): JSX.Element {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup label={t('nfseProfileTitle')}>
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="12rem" />
    </SkeletonGroup>
  )
}

export function NfseEmissionProfilePanel(props: NfseEmissionProfilePanelProps): JSX.Element {
  const { t } = useTranslation('companySettings')
  const [selectedId, setSelectedId] = useState<string>(NEW_PROFILE_VALUE)
  const [draft, setDraft] = useState<NfseProfileDraft>(EMPTY_NFSE_PROFILE_DRAFT)
  const [blockReason, setBlockReason] = useState<NfseProfileBlockReason | undefined>(undefined)

  const selected = props.profiles.find((profile) => profile.id === selectedId)

  function handleSelect(value: string) {
    const profile = props.profiles.find((candidate) => candidate.id === value)
    setSelectedId(profile === undefined ? NEW_PROFILE_VALUE : profile.id)
    setDraft(profile === undefined ? EMPTY_NFSE_PROFILE_DRAFT : toNfseProfileDraft(profile))
    setBlockReason(undefined)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submission = buildNfseProfileSubmission(draft)
    if (submission.status === 'blocked') {
      setBlockReason(submission.reason)
      return
    }
    setBlockReason(undefined)
    props.onSave({
      profileId: selected?.id,
      settings: submission.settings,
      version: selected?.version,
    })
  }

  function handleStatusChange() {
    if (selected === undefined) return
    props.onStatusChange({
      nextStatus: selected.status === 'active' ? 'inactive' : 'active',
      profileId: selected.id,
      version: selected.version,
    })
  }

  return (
    <section className={styles.certificateForm} aria-labelledby="nfse-profile-title">
      <h2 id="nfse-profile-title">{t('nfseProfileTitle')}</h2>
      <p className={styles.fieldHint}>{t('nfseProfileHint')}</p>
      {props.loading ? (
        <ProfileSkeleton />
      ) : (
        <form onSubmit={handleSubmit}>
          {props.profiles.length === 0 && (
            <p className={styles.fieldHint}>{t('nfseProfileEmpty')}</p>
          )}
          <div className={styles.fieldGrid}>
            <label>
              <span>{t('nfseProfileTitle')}</span>
              <Select
                ariaLabel={t('nfseProfileTitle')}
                disabled={props.disabled}
                onChange={handleSelect}
                options={[
                  { label: t('nfseProfileCreate'), value: NEW_PROFILE_VALUE },
                  ...props.profiles.map((profile) => ({
                    label: `${profile.name} · ${t(PROFILE_STATUS_LABEL_KEYS[profile.status])}`,
                    value: profile.id,
                  })),
                ]}
                value={selectedId}
              />
            </label>
          </div>
          <NfseProfileFields
            disabled={props.disabled}
            draft={draft}
            freightRules={props.freightRules}
            onChange={setDraft}
          />
          <button className={styles.primaryAction} disabled={props.disabled} type="submit">
            <Icon name="save" />
            {t(selected === undefined ? 'nfseProfileCreate' : 'nfseProfileSave')}
          </button>
          {selected !== undefined && (
            <button
              className={styles.secondaryAction}
              disabled={props.disabled}
              onClick={handleStatusChange}
              type="button"
            >
              <Icon name="power" />
              {t(selected.status === 'active' ? 'nfseProfileDeactivate' : 'nfseProfileActivate')}
            </button>
          )}
        </form>
      )}
      {blockReason !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t(BLOCK_REASON_LABEL_KEYS[blockReason])}
        </p>
      )}
      {props.saved && <p className={styles.formStatusSuccess}>{t('nfseProfileSaved')}</p>}
      {props.errorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t('nfseProfileError', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
