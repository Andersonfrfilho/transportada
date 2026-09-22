/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useAddressCorrectionForm } from '../hooks/useAddressCorrectionForm.hook'
import {
  formatCityCode,
  formatPostalCode,
  stripCityCode,
  stripPostalCode,
} from '../shared/addressCorrectionMask.service'
import {
  BRAZILIAN_STATES,
  isGenericCityPostalCode,
  type AddressCorrectionFieldErrors,
  type AddressCorrectionFields,
  type AddressCorrectionRequestRecord,
} from '../shared/addressCorrection.validation'
import styles from '../styles/addressReport.module.css'

type AddressCorrectionFormProps = Readonly<{
  addressKey: string
  initial: AddressCorrectionFields
  onCancel: () => void
  onSaved: (saved: AddressCorrectionRequestRecord) => void
}>

const STATE_OPTIONS = BRAZILIAN_STATES.map((state) => ({ label: state, value: state }))

export function AddressCorrectionForm({
  addressKey,
  initial,
  onCancel,
  onSaved,
}: AddressCorrectionFormProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { panelRef } = useRevealedPanel<HTMLFormElement>()
  const form = useAddressCorrectionForm({ addressKey, initial, onSaved })

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    form.submit()
  }

  function errorId(field: keyof AddressCorrectionFieldErrors): string | undefined {
    return form.fieldErrors[field] === undefined ? undefined : `address-correction-${field}`
  }

  return (
    <form className={styles.correctionForm} onSubmit={handleSubmit} ref={panelRef}>
      <h4 className={styles.correctionTitle}>{t('addressReport.correction.title')}</h4>
      <div className={styles.correctionGrid}>
        <TextField
          errorId={errorId('street')}
          field="street"
          form={form}
          label={t('addressReport.correction.street')}
        />
        <TextField
          errorId={errorId('number')}
          field="number"
          form={form}
          label={t('addressReport.correction.number')}
        />
        <PlainTextField
          field="complement"
          form={form}
          label={t('addressReport.correction.complement')}
        />
        <PlainTextField
          field="district"
          form={form}
          label={t('addressReport.correction.district')}
        />
        <TextField
          errorId={errorId('city')}
          field="city"
          form={form}
          label={t('addressReport.correction.city')}
        />
        <label>
          <span>{t('addressReport.correction.state')}</span>
          <Select
            ariaLabel={t('addressReport.correction.state')}
            options={STATE_OPTIONS}
            value={form.fields.state}
            onChange={(state) => {
              form.clearFieldError('state')
              form.patch({ state })
            }}
          />
          {form.fieldErrors.state === undefined ? null : (
            <small className={styles.correctionFieldError} role="alert">
              {t('addressCorrection.error.stateInvalid')}
            </small>
          )}
        </label>
        <label>
          <span>{t('addressReport.correction.cityCode')}</span>
          <input
            aria-invalid={form.fieldErrors.cityCode === undefined ? undefined : true}
            {...(errorId('cityCode') === undefined
              ? {}
              : { 'aria-describedby': errorId('cityCode') })}
            inputMode="numeric"
            type="text"
            value={formatCityCode(form.fields.cityCode)}
            onChange={(event) => {
              form.clearFieldError('cityCode')
              form.patch({ cityCode: stripCityCode(event.target.value) })
            }}
          />
          {form.fieldErrors.cityCode === undefined ? null : (
            <small className={styles.correctionFieldError} id={errorId('cityCode')} role="alert">
              {t('addressCorrection.error.cityCodeInvalid')}
            </small>
          )}
        </label>
        <label>
          <span>{t('addressReport.correction.postalCode')}</span>
          <input
            aria-invalid={form.fieldErrors.postalCode === undefined ? undefined : true}
            {...(errorId('postalCode') === undefined
              ? {}
              : { 'aria-describedby': errorId('postalCode') })}
            inputMode="numeric"
            type="text"
            value={formatPostalCode(form.fields.postalCode)}
            onChange={(event) => {
              form.clearFieldError('postalCode')
              form.patch({ postalCode: stripPostalCode(event.target.value) })
            }}
          />
          {form.fieldErrors.postalCode === undefined ? null : (
            <small className={styles.correctionFieldError} id={errorId('postalCode')} role="alert">
              {t('addressCorrection.error.postalCodeInvalid')}
            </small>
          )}
          {isGenericCityPostalCode(form.fields.postalCode) ? (
            <small className={styles.correctionHint}>
              {t('addressReport.correction.genericPostalCodeHint')}
            </small>
          ) : null}
        </label>
      </div>

      {form.unlabelledErrors.length === 0 ? null : (
        <p className={styles.correctionServerError} role="alert">
          {t('addressReport.correction.unlabelledErrorsLead')}{' '}
          {form.unlabelledErrors.map((error) => error.field).join(', ')}
        </p>
      )}

      <div className={styles.correctionActions}>
        <Button type="button" variant="ghost" onClick={onCancel}>
          <Icon name="close" />
          {t('addressReport.correction.cancel')}
        </Button>
        <Button disabled={form.isSaving} type="submit">
          <Icon name="save" />
          {t('addressReport.correction.save')}
        </Button>
      </div>
    </form>
  )
}

type ValidatedField = 'city' | 'number' | 'street'

type TextFieldProps = Readonly<{
  errorId?: string | undefined
  field: ValidatedField
  form: ReturnType<typeof useAddressCorrectionForm>
  label: string
}>

function TextField({ errorId, field, form, label }: TextFieldProps) {
  const { t } = useTranslation('nfeWorkspace')
  const error = form.fieldErrors[field]

  return (
    <label>
      <span>{label}</span>
      <input
        aria-invalid={error === undefined ? undefined : true}
        {...(errorId === undefined ? {} : { 'aria-describedby': errorId })}
        type="text"
        value={form.fields[field]}
        onChange={(event) => {
          form.clearFieldError(field)
          form.patch({ [field]: event.target.value })
        }}
      />
      {error === undefined ? null : (
        <small className={styles.correctionFieldError} id={errorId} role="alert">
          {t(`addressCorrection.error.${field}Required`)}
        </small>
      )}
    </label>
  )
}

type PlainTextFieldProps = Readonly<{
  field: 'complement' | 'district'
  form: ReturnType<typeof useAddressCorrectionForm>
  label: string
}>

/** Complemento e bairro são opcionais: nenhuma regra os recusa, então nenhum dos dois tem erro. */
function PlainTextField({ field, form, label }: PlainTextFieldProps) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="text"
        value={form.fields[field]}
        onChange={(event) => form.patch({ [field]: event.target.value })}
      />
    </label>
  )
}
