/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { DriverAllowanceSettings } from '../shared/driverAllowance.validation'
import {
  buildDriverAllowanceSubmission,
  startDriverAllowanceDraft,
  typeDriverAllowanceAmount,
} from '../shared/driverAllowanceForm.service'
import styles from '../styles/companySettings.module.css'

export type DriverAllowancePanelProps = Readonly<{
  disabled: boolean
  errorCode: string | undefined
  loading: boolean
  onClear: () => void
  onSave: (amount: string) => void
  saved: boolean
  stored: DriverAllowanceSettings | undefined
}>

function DriverAllowanceSkeleton() {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup label={t('driverAllowance.title')}>
      <Skeleton height="var(--field-height)" width="100%" />
    </SkeletonGroup>
  )
}

/** Rascunho local: um campo só, então não precisa da máquina de estados do painel de tributos. */
function DriverAllowanceForm(props: DriverAllowancePanelProps) {
  const { t } = useTranslation('companySettings')
  const [amount, setAmount] = useState(() => startDriverAllowanceDraft(props.stored))
  const submission = buildDriverAllowanceSubmission(amount)

  function handleSave() {
    if (submission === null) return
    props.onSave(submission)
  }

  return (
    <div className={styles.federalTaxFields}>
      <label htmlFor="driver-allowance-amount">
        {t('driverAllowance.amountLabel')}
        <input
          disabled={props.disabled}
          id="driver-allowance-amount"
          inputMode="numeric"
          maxLength={12}
          value={amount}
          onChange={(event) => setAmount(typeDriverAllowanceAmount(event.target.value))}
        />
      </label>
      {props.stored === undefined ? null : (
        <span className={styles.federalTaxOrigin}>
          {t(`driverAllowance.origin.${props.stored.rateOrigin}`)}
        </span>
      )}
      <div className={styles.federalTaxActions}>
        <button disabled={props.disabled || submission === null} type="button" onClick={handleSave}>
          <Icon name="save" />
          {t('driverAllowance.save')}
        </button>
        {props.stored?.rateOrigin === 'company' ? (
          <button disabled={props.disabled} type="button" onClick={props.onClear}>
            <Icon name="refresh" />
            {t('driverAllowance.clear')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Spec 143 D7: o valor geral de diária que a empresa paga sem valor combinado com o motorista, no
 * mesmo molde de `FederalTaxPanel` — sem linha gravada é `rateOrigin: 'default'`, R$ 200,00.
 */
export function DriverAllowancePanel(props: DriverAllowancePanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section className={styles.settingsPanel} aria-labelledby="driver-allowance-title">
      <div className={styles.sectionHeading}>
        <p className={styles.sectionKicker}>{t('driverAllowance.kicker')}</p>
        <h2 id="driver-allowance-title">{t('driverAllowance.title')}</h2>
      </div>
      <p className={styles.federalTaxNote}>{t('driverAllowance.hint')}</p>
      {props.loading ? (
        <DriverAllowanceSkeleton />
      ) : (
        <DriverAllowanceForm key={props.stored?.updatedAt ?? 'default'} {...props} />
      )}
      {props.saved ? <p role="status">{t('driverAllowance.saved')}</p> : null}
      {props.errorCode === undefined ? null : (
        <p role="alert">{t('driverAllowance.error', { code: props.errorCode })}</p>
      )}
    </section>
  )
}
