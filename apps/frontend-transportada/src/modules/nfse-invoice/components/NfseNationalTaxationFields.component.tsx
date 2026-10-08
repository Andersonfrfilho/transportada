/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import {
  findNationalTaxationFieldErrors,
  type NationalTaxationValues,
} from '../shared/nfseNationalTaxation.service'

type NfseNationalTaxationFieldsProps = Readonly<{
  classNames: Readonly<{
    error: string | undefined
    field: string | undefined
    hint: string | undefined
  }>
  disabled: boolean
  onChange: (change: Partial<NationalTaxationValues>) => void
  values: NationalTaxationValues
}>

const NATIONAL_TAXATION_CODE_LENGTH = 6
const RATE_MAX_LENGTH = 10

export function NfseNationalTaxationFields({
  classNames,
  disabled,
  onChange,
  values,
}: NfseNationalTaxationFieldsProps): JSX.Element {
  const { t } = useTranslation('nfseInvoice')
  const identifier = useId()
  const errors = findNationalTaxationFieldErrors(values)
  const codeId = `${identifier}-code`
  const rateId = `${identifier}-rate`

  return (
    <>
      <div className={classNames.field}>
        <label htmlFor={codeId}>{t('nationalTaxation.codeLabel')}</label>
        <input
          aria-describedby={`${codeId}-hint${errors.code ? ` ${codeId}-error` : ''}`}
          aria-invalid={errors.code}
          disabled={disabled}
          id={codeId}
          inputMode="numeric"
          maxLength={NATIONAL_TAXATION_CODE_LENGTH}
          onChange={(event) => onChange({ nationalTaxationCode: event.target.value })}
          value={values.nationalTaxationCode}
        />
        <small className={classNames.hint} id={`${codeId}-hint`}>
          {t('nationalTaxation.codeHint')}
        </small>
        {errors.code && (
          <small className={classNames.error} id={`${codeId}-error`} role="alert">
            {t('nationalTaxation.codeInvalid')}
          </small>
        )}
      </div>
      <div className={classNames.field}>
        <label htmlFor={rateId}>{t('nationalTaxation.rateLabel')}</label>
        <input
          aria-describedby={`${rateId}-hint${errors.rate ? ` ${rateId}-error` : ''}`}
          aria-invalid={errors.rate}
          disabled={disabled}
          id={rateId}
          inputMode="decimal"
          maxLength={RATE_MAX_LENGTH}
          onChange={(event) => onChange({ simplesNationalRate: event.target.value })}
          value={values.simplesNationalRate}
        />
        <small className={classNames.hint} id={`${rateId}-hint`}>
          {t('nationalTaxation.rateHint')}
        </small>
        {errors.rate && (
          <small className={classNames.error} id={`${rateId}-error`} role="alert">
            {t('nationalTaxation.rateInvalid')}
          </small>
        )}
      </div>
    </>
  )
}
