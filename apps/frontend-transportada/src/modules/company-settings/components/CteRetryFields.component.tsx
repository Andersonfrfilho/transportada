/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import {
  CTE_RETRY_BACKOFF_STEPS_LIMIT,
  CTE_RETRY_MAX_ATTEMPTS_LIMIT,
} from '../shared/companySettings.constant'
import type { CompanySettingsUpdate } from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'

type CteRetryPolicy = CompanySettingsUpdate['cteRetry']

type CteRetryFieldsProps = Readonly<{
  cteRetry: CteRetryPolicy
  disabled: boolean
  onChange: (cteRetry: CteRetryPolicy) => void
}>

const FALLBACK_BACKOFF_STEP = 1

function toPositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : FALLBACK_BACKOFF_STEP
}

function replaceStep(
  input: Readonly<{ index: number; steps: readonly number[]; value: number }>,
): readonly number[] {
  return input.steps.map((step, index) => (index === input.index ? input.value : step))
}

function BackoffStepField(
  props: Readonly<{
    canRemove: boolean
    index: number
    onChange: (value: number) => void
    onRemove: () => void
    value: number
  }>,
) {
  const { t } = useTranslation('companySettings')
  return (
    <div className={styles.lookupField}>
      <label>
        <span>{t('cteRetryBackoffStep', { position: props.index + 1 })}</span>
        <input
          inputMode="numeric"
          min={1}
          required
          type="number"
          value={props.value}
          onChange={(event) => props.onChange(toPositiveInteger(event.target.value))}
        />
      </label>
      {props.canRemove && (
        <button className={styles.environmentOption} type="button" onClick={props.onRemove}>
          {t('cteRetryRemoveStep', { position: props.index + 1 })}
        </button>
      )}
    </div>
  )
}

export function CteRetryFields({ cteRetry, disabled, onChange }: CteRetryFieldsProps) {
  const { t } = useTranslation('companySettings')
  const steps = cteRetry.backoffSeconds
  const lastStep = steps[steps.length - 1] ?? FALLBACK_BACKOFF_STEP
  return (
    <fieldset className={styles.fieldGroup} disabled={disabled}>
      <legend>{t('cteRetryLegend')}</legend>
      <p className={styles.fieldHint}>{t('cteRetryHint')}</p>
      <div className={styles.fieldGrid}>
        <label>
          <span>{t('cteRetryMaxAttempts')}</span>
          <input
            inputMode="numeric"
            max={CTE_RETRY_MAX_ATTEMPTS_LIMIT}
            min={1}
            required
            type="number"
            value={cteRetry.maxAttempts}
            onChange={(event) =>
              onChange({
                ...cteRetry,
                maxAttempts: Math.min(
                  toPositiveInteger(event.target.value),
                  CTE_RETRY_MAX_ATTEMPTS_LIMIT,
                ),
              })
            }
          />
        </label>
        {steps.map((step, index) => (
          <BackoffStepField
            canRemove={steps.length > 1}
            index={index}
            key={`backoff-step-${String(index)}`}
            value={step}
            onChange={(value) =>
              onChange({ ...cteRetry, backoffSeconds: replaceStep({ index, steps, value }) })
            }
            onRemove={() =>
              onChange({
                ...cteRetry,
                backoffSeconds: steps.filter((_step, current) => current !== index),
              })
            }
          />
        ))}
      </div>
      {steps.length < CTE_RETRY_BACKOFF_STEPS_LIMIT && (
        <button
          className={styles.environmentOption}
          type="button"
          onClick={() => onChange({ ...cteRetry, backoffSeconds: [...steps, lastStep] })}
        >
          {t('cteRetryAddStep')}
        </button>
      )}
    </fieldset>
  )
}
