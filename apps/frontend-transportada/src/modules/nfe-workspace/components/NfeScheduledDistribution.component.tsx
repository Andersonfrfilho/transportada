/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { resolveIneligibilityLabelKey } from '@/modules/company-settings/shared/scheduledDistribution.constant'

import {
  createBrowserWorkspaceNavigator,
  navigateToCompanySettings,
} from '../shared/companySettingsNavigation.service'
import type { ScheduledDistributionStatus } from '../shared/nfeWorkspaceClient.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeScheduledDistributionProps = Readonly<{
  canReachSettings: boolean
  loading: boolean
  scheduled: ScheduledDistributionStatus | undefined
}>

const FAILED_IMPORT_STATUS = 'failed'

function formatMoment(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(parsed))
}

function ScheduledSkeleton() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <SkeletonGroup label={t('scheduled.title')}>
      <Skeleton variant="text" width="70%" />
      <Skeleton variant="text" width="55%" />
    </SkeletonGroup>
  )
}

function EligibilityLine({ scheduled }: Readonly<{ scheduled: ScheduledDistributionStatus }>) {
  const { t } = useTranslation('nfeWorkspace')
  if (scheduled.eligible) {
    return (
      <p className={styles.distributionReady} role="status">
        {t('scheduled.ready')}
      </p>
    )
  }
  return (
    <p className={styles.distributionWarning} role="status">
      {/* O vocabulário de bloqueio é o da policy da API, traduzido uma vez só nas configurações. */}
      {t('scheduled.blocked', {
        reason: t(resolveIneligibilityLabelKey(scheduled.ineligibilityReason), {
          ns: 'companySettings',
        }),
      })}
    </p>
  )
}

function LastRunLine({ scheduled }: Readonly<{ scheduled: ScheduledDistributionStatus }>) {
  const { t } = useTranslation('nfeWorkspace')
  const run = scheduled.lastAutomationImport
  if (run === null) return <p className={styles.distributionMeta}>{t('scheduled.neverRan')}</p>
  const key = run.status === FAILED_IMPORT_STATUS ? 'scheduled.lastRunFailed' : 'scheduled.lastRun'
  return (
    <p className={styles.distributionMeta}>
      {t(key, { moment: formatMoment(run.startedAt), received: run.receivedCount })}
    </p>
  )
}

function SettingsShortcut() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <>
      <p className={styles.distributionMeta}>{t('scheduled.settingsHint')}</p>
      <div className={styles.actionRow}>
        <button
          className={styles.secondaryAction}
          onClick={() => navigateToCompanySettings(createBrowserWorkspaceNavigator())}
          type="button"
        >
          <Icon name="edit" />
          {t('scheduled.settingsShortcut')}
        </button>
      </div>
    </>
  )
}

export function NfeScheduledDistribution(props: NfeScheduledDistributionProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { scheduled } = props
  if (props.loading) return <ScheduledSkeleton />
  if (scheduled === undefined) return null
  return (
    <section className={styles.distributionPanel} aria-labelledby="nfe-scheduled-title">
      <div className={styles.panelHeading}>
        <h2 id="nfe-scheduled-title">{t('scheduled.title')}</h2>
        <p>{t(scheduled.enabled ? 'scheduled.on' : 'scheduled.off')}</p>
      </div>
      <EligibilityLine scheduled={scheduled} />
      <p className={styles.distributionMeta}>
        {t('scheduled.nextRun', { moment: formatMoment(scheduled.nextScheduledRunAt) })}
      </p>
      {scheduled.nextAllowedAt !== null && (
        <p className={styles.distributionMeta}>
          {t('scheduled.nextWindow', { moment: formatMoment(scheduled.nextAllowedAt) })}
        </p>
      )}
      <LastRunLine scheduled={scheduled} />
      {!scheduled.enabled && props.canReachSettings && <SettingsShortcut />}
    </section>
  )
}
