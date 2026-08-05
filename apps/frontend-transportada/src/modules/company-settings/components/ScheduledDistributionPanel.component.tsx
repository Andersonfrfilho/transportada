/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { resolveIneligibilityLabelKey } from '../shared/scheduledDistribution.constant'
import type {
  ScheduledDistributionRun,
  ScheduledDistributionStatus,
} from '../shared/scheduledDistribution.validation'
import styles from '../styles/companySettings.module.css'

type ScheduledDistributionPanelProps = Readonly<{
  disabled: boolean
  loading: boolean
  onToggle: (nextEnabled: boolean) => void
  status: ScheduledDistributionStatus | undefined
  toggleErrorCode: string | undefined
}>

const FAILED_IMPORT_STATUS = 'failed'

function useMomentFormatter(): (value: string) => string {
  const { i18n } = useTranslation('companySettings')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return (value) => formatter.format(new Date(value))
}

function ScheduledDistributionSkeleton() {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup label={t('scheduledDistributionTitle')}>
      <Skeleton variant="text" width="14rem" />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="60%" />
      <Skeleton height="var(--field-height)" width="14rem" />
    </SkeletonGroup>
  )
}

function EligibilityLine({ status }: Readonly<{ status: ScheduledDistributionStatus }>) {
  const { t } = useTranslation('companySettings')
  if (status.eligible)
    return <p className={styles.formStatusSuccess}>{t('scheduledDistributionReady')}</p>
  return (
    <p className={styles.formStatusError} role="status">
      {t('scheduledDistributionBlocked', {
        reason: t(resolveIneligibilityLabelKey(status.ineligibilityReason)),
      })}
    </p>
  )
}

function LastRunLine({ run }: Readonly<{ run: ScheduledDistributionRun | null }>) {
  const { t } = useTranslation('companySettings')
  const formatMoment = useMomentFormatter()
  if (run === null) return <p className={styles.fieldHint}>{t('scheduledDistributionNeverRan')}</p>
  const key =
    run.status === FAILED_IMPORT_STATUS
      ? 'scheduledDistributionLastRunFailed'
      : 'scheduledDistributionLastRun'
  return (
    <p className={styles.fieldHint}>
      {t(key, { moment: formatMoment(run.startedAt), received: run.receivedCount })}
    </p>
  )
}

function ScheduledDistributionFacts({ status }: Readonly<{ status: ScheduledDistributionStatus }>) {
  const { t } = useTranslation('companySettings')
  const formatMoment = useMomentFormatter()
  return (
    <>
      <EligibilityLine status={status} />
      {status.nextAllowedAt !== null && (
        <p className={styles.fieldHint}>
          {t('scheduledDistributionNextWindow', { moment: formatMoment(status.nextAllowedAt) })}
        </p>
      )}
      {status.certificateExpiresAt !== null && (
        <p className={styles.fieldHint}>
          {t('scheduledDistributionCertificateExpires', {
            moment: formatMoment(status.certificateExpiresAt),
          })}
        </p>
      )}
      <LastRunLine run={status.lastAutomationImport} />
    </>
  )
}

function ToggleAction(
  props: Readonly<{
    disabled: boolean
    enabled: boolean
    onToggle: (nextEnabled: boolean) => void
  }>,
) {
  const { t } = useTranslation('companySettings')
  return (
    <button
      className={props.enabled ? styles.secondaryAction : styles.primaryAction}
      disabled={props.disabled}
      type="button"
      onClick={() => props.onToggle(!props.enabled)}
    >
      <Icon name="power" />
      {t(props.enabled ? 'scheduledDistributionDisable' : 'scheduledDistributionEnable')}
    </button>
  )
}

export function ScheduledDistributionPanel(props: ScheduledDistributionPanelProps) {
  const { t } = useTranslation('companySettings')
  return (
    <section className={styles.certificateForm} aria-labelledby="scheduled-distribution-title">
      <h2 id="scheduled-distribution-title">{t('scheduledDistributionTitle')}</h2>
      <p className={styles.fieldHint}>{t('scheduledDistributionHint')}</p>
      {props.loading ? (
        <ScheduledDistributionSkeleton />
      ) : props.status === undefined ? (
        <p className={styles.formStatusError} role="alert">
          {t('scheduledDistributionError')}
        </p>
      ) : (
        <>
          <p className={styles.scheduledDistributionState}>
            {t(props.status.enabled ? 'scheduledDistributionOn' : 'scheduledDistributionOff')}
          </p>
          <ScheduledDistributionFacts status={props.status} />
          <div className={styles.certificateDeleteAction}>
            <ToggleAction
              disabled={props.disabled}
              enabled={props.status.enabled}
              onToggle={props.onToggle}
            />
          </div>
        </>
      )}
      {props.toggleErrorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t('scheduledDistributionToggleError', { code: props.toggleErrorCode })}
        </p>
      )}
    </section>
  )
}
