/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/select'
import type { FreightRuleSummary } from '@/modules/freight/shared/freightClient.service'
import type { NfseProfileDraft } from '@/modules/nfse-invoice/shared/nfseProfileForm.service'
import {
  NFSE_ISS_EXIGIBILITIES,
  NFSE_TAKERS,
  type NfseIssExigibility,
  type NfseTaker,
} from '@/modules/nfse-invoice/shared/nfseSettings.types'

import styles from '../styles/companySettings.module.css'

type NfseProfileFieldsProps = Readonly<{
  disabled: boolean
  draft: NfseProfileDraft
  freightRules: readonly FreightRuleSummary[]
  onChange: (draft: NfseProfileDraft) => void
}>

const ISS_EXIGIBILITY_LABEL_KEYS: Readonly<Record<NfseIssExigibility, string>> = {
  '1': 'nfseIssExigibility1',
  '2': 'nfseIssExigibility2',
  '3': 'nfseIssExigibility3',
  '4': 'nfseIssExigibility4',
  '5': 'nfseIssExigibility5',
  '6': 'nfseIssExigibility6',
  '7': 'nfseIssExigibility7',
}

const TAKER_LABEL_KEYS: Readonly<Record<NfseTaker, string>> = {
  '0': 'nfseTaker0',
  '3': 'nfseTaker3',
}

const CODE_MAX_LENGTH = 40
const NAME_MAX_LENGTH = 120
const OBSERVATIONS_MAX_LENGTH = 500
const TEMPLATE_MAX_LENGTH = 500
const TEXTAREA_ROWS = 3

export function NfseProfileFields({
  disabled,
  draft,
  freightRules,
  onChange,
}: NfseProfileFieldsProps): JSX.Element {
  const { t } = useTranslation('companySettings')

  function patch(change: Partial<NfseProfileDraft>) {
    onChange({ ...draft, ...change })
  }

  return (
    <div className={styles.fieldGrid}>
      <label>
        <span>{t('nfseProfileNameLabel')}</span>
        <input
          disabled={disabled}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => patch({ name: event.target.value })}
          value={draft.name}
        />
      </label>
      <label>
        <span>{t('nfseProfileFreightRuleLabel')}</span>
        <Select
          ariaLabel={t('nfseProfileFreightRuleLabel')}
          disabled={disabled}
          onChange={(value) => patch({ freightRuleId: value })}
          options={freightRules.map((rule) => ({ label: rule.name, value: rule.id }))}
          placeholder={t('nfseProfileFreightRuleLabel')}
          value={draft.freightRuleId}
        />
      </label>
      <label>
        <span>{t('nfseProfileServiceListItemLabel')}</span>
        <input
          disabled={disabled}
          maxLength={CODE_MAX_LENGTH}
          onChange={(event) => patch({ serviceListItem: event.target.value })}
          value={draft.serviceListItem}
        />
      </label>
      <label>
        <span>{t('nfseProfileCnaeLabel')}</span>
        <input
          disabled={disabled}
          inputMode="numeric"
          maxLength={CODE_MAX_LENGTH}
          onChange={(event) => patch({ cnaeCode: event.target.value })}
          value={draft.cnaeCode}
        />
      </label>
      <label>
        <span>{t('nfseProfileMunicipalityLabel')}</span>
        <input
          disabled={disabled}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => patch({ municipalityName: event.target.value })}
          value={draft.municipalityName}
        />
      </label>
      <label>
        <span>{t('nfseProfileMunicipalityIbgeLabel')}</span>
        <input
          disabled={disabled}
          inputMode="numeric"
          maxLength={CODE_MAX_LENGTH}
          onChange={(event) => patch({ municipalityIbgeCode: event.target.value })}
          value={draft.municipalityIbgeCode}
        />
      </label>
      <label>
        <span>{t('nfseProfileIssRateLabel')}</span>
        <input
          disabled={disabled}
          inputMode="decimal"
          maxLength={CODE_MAX_LENGTH}
          onChange={(event) => patch({ issRatePercent: event.target.value })}
          value={draft.issRatePercent}
        />
      </label>
      <label>
        <span>{t('nfseProfileIssExigibilityLabel')}</span>
        <Select
          ariaLabel={t('nfseProfileIssExigibilityLabel')}
          disabled={disabled}
          onChange={(value) => patch({ issExigibility: value as NfseIssExigibility })}
          options={NFSE_ISS_EXIGIBILITIES.map((exigibility) => ({
            label: t(ISS_EXIGIBILITY_LABEL_KEYS[exigibility]),
            value: exigibility,
          }))}
          value={draft.issExigibility}
        />
      </label>
      <label>
        <span>{t('nfseProfileTakerLabel')}</span>
        <Select
          ariaLabel={t('nfseProfileTakerLabel')}
          disabled={disabled}
          onChange={(value) => patch({ taker: value as NfseTaker })}
          options={NFSE_TAKERS.map((taker) => ({
            label: t(TAKER_LABEL_KEYS[taker]),
            value: taker,
          }))}
          value={draft.taker}
        />
      </label>
      <Checkbox
        checked={draft.issWithheld}
        disabled={disabled}
        label={t('nfseProfileIssWithheldLabel')}
        onChange={(checked) => patch({ issWithheld: checked })}
      />
      <label>
        <span>{t('nfseProfileMunicipalTaxationLabel')}</span>
        <input
          disabled={disabled}
          maxLength={CODE_MAX_LENGTH}
          onChange={(event) => patch({ municipalTaxationCode: event.target.value })}
          value={draft.municipalTaxationCode}
        />
      </label>
      <label>
        <span>{t('nfseProfileNbsLabel')}</span>
        <input
          disabled={disabled}
          maxLength={CODE_MAX_LENGTH}
          onChange={(event) => patch({ nbsCode: event.target.value })}
          value={draft.nbsCode}
        />
      </label>
      <label>
        <span>{t('nfseProfileChargeComponentLabel')}</span>
        <input
          disabled={disabled}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => patch({ chargeComponentLabel: event.target.value })}
          value={draft.chargeComponentLabel}
        />
      </label>
      <label>
        <span>{t('nfseProfileDescriptionMaxLengthLabel')}</span>
        <input
          disabled={disabled}
          inputMode="numeric"
          maxLength={CODE_MAX_LENGTH}
          onChange={(event) => patch({ descriptionMaxLength: event.target.value })}
          value={draft.descriptionMaxLength}
        />
      </label>
      <label className={styles.fieldWide}>
        <span>{t('nfseProfileDescriptionTemplateLabel')}</span>
        <textarea
          disabled={disabled}
          maxLength={TEMPLATE_MAX_LENGTH}
          onChange={(event) => patch({ descriptionTemplate: event.target.value })}
          rows={TEXTAREA_ROWS}
          value={draft.descriptionTemplate}
        />
      </label>
      <p className={styles.fieldHint}>{t('nfseProfileDescriptionVariablesHint')}</p>
      <label className={styles.fieldWide}>
        <span>{t('nfseProfileObservationsLabel')}</span>
        <textarea
          disabled={disabled}
          maxLength={OBSERVATIONS_MAX_LENGTH}
          onChange={(event) => patch({ observations: event.target.value })}
          rows={TEXTAREA_ROWS}
          value={draft.observations}
        />
      </label>
    </div>
  )
}
