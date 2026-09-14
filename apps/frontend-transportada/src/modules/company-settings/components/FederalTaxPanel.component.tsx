/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

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
import styles from '../styles/companySettings.module.css'

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
    <label htmlFor={fieldId}>
      {t(`federalTaxes.${props.field}Label`)}
      <input
        disabled={props.disabled}
        id={fieldId}
        inputMode="decimal"
        maxLength={8}
        value={props.value}
        onChange={(event) => props.onChange(props.field, event.target.value)}
      />
      {props.origin === null ? null : (
        <span className={styles.federalTaxOrigin}>{t(`federalTaxes.origin.${props.origin}`)}</span>
      )}
    </label>
  )
}

function FederalTaxForm(props: FederalTaxPanelProps) {
  const { t } = useTranslation('companySettings')
  const form = useFederalTaxForm({ stored: props.stored, taxRegime: props.taxRegime })
  const submission = form.submission
  return (
    <div className={styles.federalTaxFields}>
      {/* O `Select` do DS recebe o nome acessível por `ariaLabel`; aqui é só o texto visível. */}
      <p className={styles.sectionKicker}>{t('federalTaxes.regimeLabel')}</p>
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
      {form.draft.regime === 'simple' ? (
        <p className={styles.federalTaxNote}>{t('federalTaxes.simpleNote')}</p>
      ) : null}
      {form.draft.regime === 'real' ? (
        <p className={styles.federalTaxNote}>{t('federalTaxes.realNote')}</p>
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
      <div className={styles.federalTaxActions}>
        <button
          disabled={props.disabled || submission === null}
          type="button"
          onClick={() => (submission === null ? undefined : props.onSave(submission))}
        >
          <Icon name="save" />
          {t('federalTaxes.save')}
        </button>
        {props.stored === null ? null : (
          <button disabled={props.disabled} type="button" onClick={props.onClear}>
            <Icon name="refresh" />
            {t('federalTaxes.clear')}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Spec 126: o regime federal da empresa, que a conta da viagem desconta da receita. A sugestão sai
 * do CRT e da lei; quem confirma é o contador — por isso a origem fica impressa ao lado do número.
 */
export function FederalTaxPanel(props: FederalTaxPanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section className={styles.settingsPanel} aria-labelledby="federal-taxes-title">
      <div className={styles.sectionHeading}>
        <p className={styles.sectionKicker}>{t('federalTaxes.kicker')}</p>
        <h2 id="federal-taxes-title">{t('federalTaxes.title')}</h2>
      </div>
      <p className={styles.federalTaxNote}>{t('federalTaxes.hint')}</p>
      {props.loading ? (
        <FederalTaxSkeleton />
      ) : (
        <FederalTaxForm key={props.stored?.updatedAt ?? 'undeclared'} {...props} />
      )}
      {props.saved ? <p role="status">{t('federalTaxes.saved')}</p> : null}
      {props.errorCode === undefined ? null : (
        <p role="alert">{t('federalTaxes.error', { code: props.errorCode })}</p>
      )}
    </section>
  )
}
