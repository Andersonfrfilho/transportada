/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { SearchableSelect } from '@/components/ui/searchable-select'

import {
  BILLING_BANK_ACCOUNT_MAX_LENGTH,
  BILLING_BANK_BRANCH_MAX_LENGTH,
  BILLING_BANK_CODE_LENGTH,
  BILLING_BANK_NAME_MAX_LENGTH,
  BILLING_OBSERVATIONS_MAX_LENGTH,
  PIX_KEY_TYPE_LABEL_KEYS,
} from '../shared/companySettings.constant'
import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import {
  digitsWithOptionalCheckDigit,
  formatBankAccountNumber,
} from '../shared/companySettingsMask.service'
import { BRAZILIAN_BANKS } from '../shared/brazilianBanks.constant'
import { detectPixKeyType } from '../shared/pixKeyType.service'
import styles from '../styles/companySettings.module.css'

type BillingDefaults = CompanySettingsUpdate['billing']

type BillingDefaultsFieldsProps = Readonly<{
  billing: BillingDefaults
  disabled: boolean
  onChange: (billing: BillingDefaults) => void
}>

const PIX_KEY_MAX_LENGTH = 77
const OBSERVATIONS_ROWS = 3
// O hífen do dígito verificador só existe na exibição, mas ocupa uma posição no campo.
const BANK_ACCOUNT_DISPLAY_MAX_LENGTH = BILLING_BANK_ACCOUNT_MAX_LENGTH + 1
const BANK_OPTIONS = BRAZILIAN_BANKS.map((bank) => ({
  label: `${bank.code} — ${bank.name}`,
  value: bank.code,
}))

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function findBankName(code: string): string | undefined {
  return BRAZILIAN_BANKS.find((bank) => bank.code === code)?.name
}

export function BillingDefaultsFields({ billing, disabled, onChange }: BillingDefaultsFieldsProps) {
  const { t } = useTranslation('companySettings')
  const pixKeyType = detectPixKeyType(billing.pixKey)
  // O catálogo cobre os bancos usuais, não a Febraban inteira: o código digitado tem de valer.
  const resolveCustomBank = (query: string) => {
    const code = digitsOnly(query)
    if (code.length !== BILLING_BANK_CODE_LENGTH) return undefined
    return { label: t('billingBankCodeCustom', { code }), value: code }
  }
  return (
    <fieldset className={styles.fieldGroup} disabled={disabled}>
      <legend>{t('billingLegend')}</legend>
      <p className={styles.fieldHint}>{t('billingHint')}</p>
      <div className={styles.fieldGrid}>
        <label>
          <span>{t('billingBankCode')}</span>
          <SearchableSelect
            ariaLabel={t('billingBankCode')}
            disabled={disabled}
            emptyLabel={t('billingBankSearchEmpty')}
            options={BANK_OPTIONS}
            placeholder={t('billingBankSearchPlaceholder')}
            resolveCustomOption={resolveCustomBank}
            searchPlaceholder={t('billingBankSearchPlaceholder')}
            value={billing.bankCode}
            onChange={(value) =>
              onChange({
                ...billing,
                bankCode: value,
                bankName: findBankName(value) ?? billing.bankName,
              })
            }
          />
        </label>
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
            maxLength={BANK_ACCOUNT_DISPLAY_MAX_LENGTH}
            type="text"
            value={formatBankAccountNumber(billing.bankAccount)}
            onChange={(event) =>
              onChange({
                ...billing,
                bankAccount: digitsWithOptionalCheckDigit(event.target.value).slice(
                  0,
                  BILLING_BANK_ACCOUNT_MAX_LENGTH,
                ),
              })
            }
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
          {pixKeyType !== undefined && (
            <span className={styles.pixKeyTypeHint}>
              {t('pixKeyTypeDetected')}{' '}
              <Badge variant="secondary">{t(PIX_KEY_TYPE_LABEL_KEYS[pixKeyType])}</Badge>
            </span>
          )}
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
