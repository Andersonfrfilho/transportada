/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useFederalTaxForm } from '../hooks/useFederalTaxForm.hook'
import type { FederalTaxSettings } from '../shared/federalTax.validation'
import type {
  FederalRateOrigin,
  FederalTaxRegimeCode,
  FederalTaxSubmission,
} from '../shared/federalTaxSuggestion.service'
import styles from '../styles/businessCalendar.module.css'

export type FederalTaxPanelProps = Readonly<{
  disabled: boolean
  errorCode: string | undefined
  loading: boolean
  onClear: () => void
  onSave: (submission: FederalTaxSubmission) => void
  saved: boolean
  stored: FederalTaxSettings | null
  taxRegime: FederalTaxRegimeCode | null
}>

type RateFieldProps = Readonly<{
  disabled: boolean
  field: 'cofins' | 'pis'
  onChange: (field: 'cofins' | 'pis', text: string) => void
  origin: FederalRateOrigin | null
  value: string
}>

function FederalTaxSkeleton() {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup label={t('federalTaxes.title')}>
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
    </SkeletonGroup>
  )
}

/** Percentual na tela; a origem ao lado diz se o número é da lei, do cadastro ou digitado agora. */
function RateField(props: RateFieldProps) {
  const { t } = useTranslation('companySettings')
  const fieldId = `federal-tax-${props.field}`
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={fieldId}>
        {t(`federalTaxes.${props.field}Label`)}
      </label>
      <input
        className={styles.input}
        disabled={props.disabled}
        id={fieldId}
        inputMode="decimal"
        maxLength={8}
        value={props.value}
        onChange={(event) => props.onChange(props.field, event.target.value)}
      />
      {props.origin === null ? null : (
        <p className={styles.hint}>{t(`federalTaxes.origin.${props.origin}`)}</p>
      )}
    </div>
  )
}

function FederalTaxForm(props: FederalTaxPanelProps) {
  const { t } = useTranslation('companySettings')
  const form = useFederalTaxForm({ stored: props.stored, taxRegime: props.taxRegime })
  const submission = form.submission
  return (
    <section className={styles.block}>
      <div className={styles.form}>
        {/* O `Select` do DS recebe o nome acessível por `ariaLabel`; aqui é só o texto visível. */}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('federalTaxes.regimeLabel')}</span>
          <Select
            ariaLabel={t('federalTaxes.regimeLabel')}
            disabled={props.disabled}
            options={form.regimes.map((regime) => ({
              label: t(`federalTaxes.regime.${regime}`),
              value: regime,
            }))}
            placeholder={t('federalTaxes.regimePlaceholder')}
            value={form.draft.regime}
            onChange={form.handleRegimeChange}
          />
        </div>
        {form.draft.regime === 'simple' ? (
          <p className={styles.routingNotice}>{t('federalTaxes.simpleNote')}</p>
        ) : null}
        {form.draft.regime === 'real' ? (
          <p className={styles.routingNotice}>{t('federalTaxes.realNote')}</p>
        ) : null}
        <RateField
          disabled={props.disabled}
          field="pis"
          origin={form.draft.pisOrigin}
          value={form.draft.pis}
          onChange={form.handleRateChange}
        />
        <RateField
          disabled={props.disabled}
          field="cofins"
          origin={form.draft.cofinsOrigin}
          value={form.draft.cofins}
          onChange={form.handleRateChange}
        />
        <div className={styles.actions}>
          <Button
            disabled={props.disabled || submission === null}
            type="button"
            onClick={() => (submission === null ? undefined : props.onSave(submission))}
          >
            <Icon name="save" />
            {t('federalTaxes.save')}
          </Button>
          {props.stored === null ? null : (
            <Button
              disabled={props.disabled}
              type="button"
              variant="secondary"
              onClick={props.onClear}
            >
              <Icon name="refresh" />
              {t('federalTaxes.clear')}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Spec 126: o regime federal da empresa, que a conta da viagem desconta da receita. A sugestão sai
 * do CRT e da lei; quem confirma é o contador — por isso a origem fica impressa ao lado do número.
 */
export function FederalTaxPanel(props: FederalTaxPanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section aria-labelledby="federal-taxes-title" className={styles.panel}>
      <div className={styles.panelHeading}>
        <p className={styles.kicker}>{t('federalTaxes.kicker')}</p>
        <h2 id="federal-taxes-title">{t('federalTaxes.title')}</h2>
        <p className={styles.hint}>{t('federalTaxes.hint')}</p>
      </div>
      {props.loading ? (
        <FederalTaxSkeleton />
      ) : (
        <FederalTaxForm key={props.stored?.updatedAt ?? 'undeclared'} {...props} />
      )}
      {props.saved ? (
        <p className={styles.status} role="status">
          {t('federalTaxes.saved')}
        </p>
      ) : null}
      {props.errorCode === undefined ? null : (
        <p className={styles.refusal} role="alert">
          {t('federalTaxes.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
