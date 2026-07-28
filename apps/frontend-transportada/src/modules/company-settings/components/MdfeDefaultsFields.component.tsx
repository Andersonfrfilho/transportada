/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'

type MdfeDefaults = CompanySettingsUpdate['mdfe']

type MdfeDefaultsFieldsProps = Readonly<{
  disabled: boolean
  mdfe: MdfeDefaults
  onChange: (mdfe: MdfeDefaults) => void
}>

const BANK_BRANCH_MAX_LENGTH = 10
const BANK_CODE_MAX_LENGTH = 3
const INSURANCE_POLICY_MAX_LENGTH = 20
const INSURER_NAME_MAX_LENGTH = 60
const INSURER_TAX_ID_MAX_LENGTH = 14
const PIX_KEY_MAX_LENGTH = 77
const RESPONSIBILITY_OPTIONS = ['', '1', '2'] as const

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function isResponsibility(value: string): value is MdfeDefaults['insuranceResponsibility'] {
  return RESPONSIBILITY_OPTIONS.some((option) => option === value)
}

export function MdfeDefaultsFields({ disabled, mdfe, onChange }: MdfeDefaultsFieldsProps) {
  const { t } = useTranslation('companySettings')
  return (
    <fieldset className={styles.fieldGroup} disabled={disabled}>
      <legend>{t('mdfeLegend')}</legend>
      <p className={styles.fieldHint}>{t('mdfeHint')}</p>
      <div className={styles.fieldGrid}>
        <label>
          <span>{t('mdfeInsuranceResponsibility')}</span>
          <select
            value={mdfe.insuranceResponsibility}
            onChange={(event) => {
              const value = event.target.value
              if (isResponsibility(value)) onChange({ ...mdfe, insuranceResponsibility: value })
            }}
          >
            {RESPONSIBILITY_OPTIONS.map((option) => (
              <option key={`mdfe-responsibility-${option}`} value={option}>
                {t(option === '' ? 'mdfeResponsibilityNone' : `mdfeResponsibility${option}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('mdfeInsurerName')}</span>
          <input
            maxLength={INSURER_NAME_MAX_LENGTH}
            type="text"
            value={mdfe.insurerName}
            onChange={(event) => onChange({ ...mdfe, insurerName: event.target.value })}
          />
        </label>
        <label>
          <span>{t('mdfeInsurerTaxId')}</span>
          <input
            inputMode="numeric"
            maxLength={INSURER_TAX_ID_MAX_LENGTH}
            type="text"
            value={mdfe.insurerTaxId}
            onChange={(event) =>
              onChange({ ...mdfe, insurerTaxId: digitsOnly(event.target.value) })
            }
          />
        </label>
        <label>
          <span>{t('mdfeInsurancePolicy')}</span>
          <input
            maxLength={INSURANCE_POLICY_MAX_LENGTH}
            type="text"
            value={mdfe.insurancePolicy}
            onChange={(event) => onChange({ ...mdfe, insurancePolicy: event.target.value })}
          />
        </label>
        <label>
          <span>{t('mdfeBankCode')}</span>
          <input
            inputMode="numeric"
            maxLength={BANK_CODE_MAX_LENGTH}
            type="text"
            value={mdfe.bankCode}
            onChange={(event) => onChange({ ...mdfe, bankCode: digitsOnly(event.target.value) })}
          />
        </label>
        <label>
          <span>{t('mdfeBankBranch')}</span>
          <input
            inputMode="numeric"
            maxLength={BANK_BRANCH_MAX_LENGTH}
            type="text"
            value={mdfe.bankBranch}
            onChange={(event) => onChange({ ...mdfe, bankBranch: digitsOnly(event.target.value) })}
          />
        </label>
        <label>
          <span>{t('mdfePixKey')}</span>
          <input
            maxLength={PIX_KEY_MAX_LENGTH}
            type="text"
            value={mdfe.pixKey}
            onChange={(event) => onChange({ ...mdfe, pixKey: event.target.value })}
          />
        </label>
      </div>
    </fieldset>
  )
}
