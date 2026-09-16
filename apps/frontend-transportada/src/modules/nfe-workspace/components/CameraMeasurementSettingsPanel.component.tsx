/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon, type IconName } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { CameraMeasurementExportEntry } from '../shared/cameraMeasurementValidation.service'
import type { CameraMeasurementValidationSummary } from '../shared/cameraMeasurementValidation.service'
import styles from '../styles/distributionSettings.module.css'

type CameraMeasurementSettingsPanelProps = Readonly<{
  disabled: boolean
  enabled: boolean | undefined
  loading: boolean
  onToggle: (nextEnabled: boolean) => void
  toggleErrorCode: string | undefined
  validation: CameraMeasurementValidationPanelProps
}>

export type CameraMeasurementValidationPanelProps = Readonly<{
  entries: readonly CameraMeasurementExportEntry[]
  errorCode: string | undefined
  from: string
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
  onExport: () => void
  onLoadMore: () => void
  onPeriodChange: (from: string, to: string) => void
  summary: CameraMeasurementValidationSummary
  to: string
}>

function CameraMeasurementSettingsSkeleton() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <SkeletonGroup label={t('cameraMeasurementTitle')}>
      <Skeleton variant="text" width="16rem" />
      <Skeleton variant="text" width="80%" />
      <Skeleton height="var(--field-height)" width="12rem" />
    </SkeletonGroup>
  )
}

function toPercent(rate: null | number): string {
  return rate === null ? '—' : String(Math.round(rate * 100))
}

const VERDICT_ICON: Readonly<Record<CameraMeasurementValidationSummary['verdict'], IconName>> = {
  go: 'check',
  'insufficient-data': 'clock',
  'no-go': 'alert',
}

const VERDICT_STATUS_CLASS: Readonly<
  Record<CameraMeasurementValidationSummary['verdict'], string>
> = {
  go: 'formStatusSuccess',
  'insufficient-data': 'fieldHint',
  'no-go': 'formStatusError',
}

/**
 * Spec 152 T12 (R6/R8): o resumo da validação — nunca só um número; texto e ícone dizem o veredito,
 * a contagem de leituras com margem conhecida vem ao lado da taxa de margem (D17: a margem é da
 * proposta e continua gravada mesmo em dimensão editada; só falta quando a câmera nunca propôs
 * aquela dimensão).
 */
function CameraMeasurementValidationSummaryView(
  props: Readonly<{
    summary: CameraMeasurementValidationSummary
    t: ReturnType<typeof useTranslation<'nfeWorkspace'>>['t']
  }>,
) {
  const { summary, t } = props

  if (summary.readingCount === 0) {
    return <p className={styles.fieldHint}>{t('cameraMeasurementValidationEmpty')}</p>
  }

  const verdictKey = {
    go: 'cameraMeasurementValidationVerdictGo',
    'insufficient-data': 'cameraMeasurementValidationVerdictInsufficient',
    'no-go': 'cameraMeasurementValidationVerdictNoGo',
  }[summary.verdict]
  const verdictClassName = styles[VERDICT_STATUS_CLASS[summary.verdict]]

  return (
    <div className={styles.settingsPanel}>
      <p className={styles.fieldHint}>
        {t('cameraMeasurementValidationReadingCount', { count: summary.readingCount })}
      </p>
      <p className={styles.fieldHint}>
        {t('cameraMeasurementValidationWithinTen', {
          percent: toPercent(summary.withinTenMillimetreRate),
        })}
      </p>
      <p className={styles.fieldHint}>
        {t('cameraMeasurementValidationWithinMargin', {
          known: summary.withinMarginKnownCount,
          percent: toPercent(summary.withinMarginRate),
        })}
      </p>
      <p className={styles.fieldHint}>{t('cameraMeasurementValidationMarginHint')}</p>
      <p className={verdictClassName} role="status">
        <Icon name={VERDICT_ICON[summary.verdict]} /> {t(verdictKey)}
      </p>
    </div>
  )
}

function CameraMeasurementValidationSection(
  props: Readonly<{
    t: ReturnType<typeof useTranslation<'nfeWorkspace'>>['t']
    validation: CameraMeasurementValidationPanelProps
  }>,
) {
  const { t, validation } = props

  return (
    <section className={styles.settingsPanel} aria-labelledby="camera-measurement-validation-title">
      <h2 id="camera-measurement-validation-title">{t('cameraMeasurementValidationTitle')}</h2>
      <p className={styles.fieldHint}>{t('cameraMeasurementValidationHint')}</p>
      <label>
        {t('cameraMeasurementValidationPeriod')}
        <DateRangePicker
          ariaLabel={t('cameraMeasurementValidationPeriod')}
          clearLabel={t('cameraMeasurementValidationClearPeriod')}
          from={validation.from}
          nextMonthLabel={t('cameraMeasurementValidationNextMonth')}
          onChange={validation.onPeriodChange}
          placeholder={t('cameraMeasurementValidationPeriodPlaceholder')}
          previousMonthLabel={t('cameraMeasurementValidationPreviousMonth')}
          to={validation.to}
        />
      </label>
      {validation.isLoading ? (
        <Skeleton height="var(--field-height)" width="100%" />
      ) : (
        <CameraMeasurementValidationSummaryView summary={validation.summary} t={t} />
      )}
      {validation.errorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t('cameraMeasurementValidationExportError', { code: validation.errorCode })}
        </p>
      )}
      <div className={styles.actionRow}>
        {validation.hasNextPage && (
          <button
            className={styles.secondaryAction}
            disabled={validation.isFetchingNextPage}
            onClick={validation.onLoadMore}
            type="button"
          >
            {t(
              validation.isFetchingNextPage
                ? 'cameraMeasurementValidationLoadingMore'
                : 'cameraMeasurementValidationLoadMore',
            )}
          </button>
        )}
        <button
          className={styles.primaryAction}
          disabled={validation.entries.length === 0}
          onClick={validation.onExport}
          type="button"
        >
          <Icon name="download" />
          {t('cameraMeasurementValidationExport')}
        </button>
      </div>
    </section>
  )
}

/**
 * Spec 152 D14: o interruptor por empresa da medida de caixa pela câmera — experimental e
 * desligada por padrão em toda instalação (D13). T12 estende com o export do histórico e o resumo
 * da validação (R6/R8), consumidos pela mesma permissão `settings.manage`.
 */
export function CameraMeasurementSettingsPanel(props: CameraMeasurementSettingsPanelProps) {
  const { t } = useTranslation('nfeWorkspace')

  if (props.loading) return <CameraMeasurementSettingsSkeleton />

  const enabled = props.enabled ?? false

  return (
    <>
      <section className={styles.settingsPanel} aria-labelledby="camera-measurement-title">
        <h2 id="camera-measurement-title">{t('cameraMeasurementTitle')}</h2>
        <p className={styles.fieldHint}>{t('cameraMeasurementHint')}</p>
        <p className={styles.fieldHint}>
          <Icon name="camera" /> {t('cameraMeasurementExperimental')}
        </p>
        <p className={enabled ? styles.formStatusSuccess : styles.fieldHint}>
          {t(enabled ? 'cameraMeasurementOn' : 'cameraMeasurementOff')}
        </p>
        <div className={styles.actionRow}>
          <button
            className={enabled ? styles.secondaryAction : styles.primaryAction}
            disabled={props.disabled}
            onClick={() => props.onToggle(!enabled)}
            type="button"
          >
            <Icon name="power" />
            {t(enabled ? 'cameraMeasurementDisable' : 'cameraMeasurementEnable')}
          </button>
        </div>
        {props.toggleErrorCode !== undefined && (
          <p className={styles.formStatusError} role="alert">
            {t('cameraMeasurementToggleError', { code: props.toggleErrorCode })}
          </p>
        )}
      </section>
      <CameraMeasurementValidationSection t={t} validation={props.validation} />
    </>
  )
}
