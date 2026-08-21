/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { formatCnpj, normalizeTaxId } from '@/modules/shared/taxId.service'

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
const INSURER_TAX_ID_MAX_LENGTH = 18
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
          <Select
            ariaLabel={t('mdfeInsuranceResponsibility')}
            options={RESPONSIBILITY_OPTIONS.map((option) => ({
              label: t(option === '' ? 'mdfeResponsibilityNone' : `mdfeResponsibility${option}`),
              value: option,
            }))}
            value={mdfe.insuranceResponsibility}
            onChange={(value) => {
              if (isResponsibility(value)) onChange({ ...mdfe, insuranceResponsibility: value })
            }}
          />
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
            maxLength={INSURER_TAX_ID_MAX_LENGTH}
            type="text"
            value={formatCnpj(mdfe.insurerTaxId)}
            onChange={(event) =>
              onChange({ ...mdfe, insurerTaxId: normalizeTaxId(event.target.value) })
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
