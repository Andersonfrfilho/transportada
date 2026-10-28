/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { DriverAllowanceSettings } from '../shared/driverAllowance.validation'
import {
  DRIVER_ALLOWANCE_MAX_LENGTH,
  buildDriverAllowanceSubmission,
  startDriverAllowanceDraft,
  typeDriverAllowanceAmount,
} from '../shared/driverAllowanceForm.service'
import styles from '../styles/businessCalendar.module.css'

export type DriverAllowancePanelProps = Readonly<{
  disabled: boolean
  errorCode: string | undefined
  loading: boolean
  onClear: () => void
  /** O resultado da última gravação deixa de descrever a tela no instante em que ela muda. */
  onEdit: () => void
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

  function handleAmountChange(typed: string) {
    props.onEdit()
    setAmount(typeDriverAllowanceAmount(typed))
  }

  return (
    <section className={styles.block}>
      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="driver-allowance-amount">
            {t('driverAllowance.amountLabel')}
          </label>
          <input
            className={styles.input}
            disabled={props.disabled}
            id="driver-allowance-amount"
            inputMode="numeric"
            maxLength={DRIVER_ALLOWANCE_MAX_LENGTH}
            value={amount}
            onChange={(event) => handleAmountChange(event.target.value)}
          />
          {props.stored === undefined ? null : (
            <p className={styles.hint}>{t(`driverAllowance.origin.${props.stored.rateOrigin}`)}</p>
          )}
        </div>
        <div className={styles.actions}>
          <Button
            disabled={props.disabled || submission === null}
            type="button"
            onClick={handleSave}
          >
            <Icon name="save" />
            {t('driverAllowance.save')}
          </Button>
          {props.stored?.rateOrigin === 'company' ? (
            <Button
              disabled={props.disabled}
              type="button"
              variant="secondary"
              onClick={props.onClear}
            >
              <Icon name="refresh" />
              {t('driverAllowance.clear')}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/**
 * Spec 143 D7: o valor geral de diária que a empresa paga sem valor combinado com o motorista, no
 * mesmo molde de `FederalTaxPanel` — sem linha gravada é `rateOrigin: 'default'`, R$ 200,00.
 */
export function DriverAllowancePanel(props: DriverAllowancePanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section aria-labelledby="driver-allowance-title" className={styles.panel}>
      <div className={styles.panelHeading}>
        <p className={styles.kicker}>{t('driverAllowance.kicker')}</p>
        <h2 id="driver-allowance-title">{t('driverAllowance.title')}</h2>
        <p className={styles.hint}>{t('driverAllowance.hint')}</p>
      </div>
      {props.loading ? (
        <DriverAllowanceSkeleton />
      ) : (
        <DriverAllowanceForm key={props.stored?.updatedAt ?? 'default'} {...props} />
      )}
      {props.saved ? (
        <p className={styles.status} role="status">
          {t('driverAllowance.saved')}
        </p>
      ) : null}
      {props.errorCode === undefined ? null : (
        <p className={styles.refusal} role="alert">
          {t('driverAllowance.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
