/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import {
  BILLING_BANK_ACCOUNT_MAX_LENGTH,
  BILLING_BANK_BRANCH_MAX_LENGTH,
  BILLING_BANK_CODE_LENGTH,
  BILLING_BANK_NAME_MAX_LENGTH,
  BILLING_OBSERVATIONS_MAX_LENGTH,
} from '../shared/companySettings.constant'
import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'

type BillingDefaults = CompanySettingsUpdate['billing']

type BillingDefaultsFieldsProps = Readonly<{
  billing: BillingDefaults
  disabled: boolean
  onChange: (billing: BillingDefaults) => void
}>

const PIX_KEY_MAX_LENGTH = 77
const OBSERVATIONS_ROWS = 3

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function BillingDefaultsFields({ billing, disabled, onChange }: BillingDefaultsFieldsProps) {
  const { t } = useTranslation('companySettings')
  return (
    <fieldset className={styles.fieldGroup} disabled={disabled}>
      <legend>{t('billingLegend')}</legend>
      <p className={styles.fieldHint}>{t('billingHint')}</p>
      <div className={styles.fieldGrid}>
        <label>
          <span>{t('billingBankName')}</span>
          <input
            maxLength={BILLING_BANK_NAME_MAX_LENGTH}
            type="text"
            value={billing.bankName}
            onChange={(event) => onChange({ ...billing, bankName: event.target.value })}
          />
        </label>
        <label>
          <span>{t('billingBankCode')}</span>
          <input
            inputMode="numeric"
            maxLength={BILLING_BANK_CODE_LENGTH}
            type="text"
            value={billing.bankCode}
            onChange={(event) => onChange({ ...billing, bankCode: digitsOnly(event.target.value) })}
          />
        </label>
        <label>
          <span>{t('billingBankBranch')}</span>
          <input
            inputMode="numeric"
            maxLength={BILLING_BANK_BRANCH_MAX_LENGTH}
            type="text"
            value={billing.bankBranch}
            onChange={(event) =>
              onChange({ ...billing, bankBranch: digitsOnly(event.target.value) })
            }
          />
        </label>
        <label>
          <span>{t('billingBankAccount')}</span>
          <input
            maxLength={BILLING_BANK_ACCOUNT_MAX_LENGTH}
            type="text"
            value={billing.bankAccount}
            onChange={(event) => onChange({ ...billing, bankAccount: event.target.value })}
          />
        </label>
        <label>
          <span>{t('billingPixKey')}</span>
          <input
            maxLength={PIX_KEY_MAX_LENGTH}
            type="text"
            value={billing.pixKey}
            onChange={(event) => onChange({ ...billing, pixKey: event.target.value })}
          />
        </label>
        <label className={styles.fieldWide}>
          <span>{t('billingObservations')}</span>
          <textarea
            maxLength={BILLING_OBSERVATIONS_MAX_LENGTH}
            rows={OBSERVATIONS_ROWS}
            value={billing.observations}
            onChange={(event) => onChange({ ...billing, observations: event.target.value })}
          />
        </label>
      </div>
    </fieldset>
  )
}
