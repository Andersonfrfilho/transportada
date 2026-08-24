/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { NfeJobRunSnapshot } from '../shared/nfeWorkspaceClient.service'
import { useCountdown } from '../hooks/useCountdown.hook'
import {
  type NfeDistributionPullControl,
  formatCountdown,
} from '../shared/nfeDistributionPull.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeDistributionControlProps = Readonly<{
  readonly canImport: boolean
  readonly pending: boolean
  readonly lastRun: NfeJobRunSnapshot | null | undefined
  readonly pullControl: NfeDistributionPullControl
  readonly onCooldownEnd?: () => void
  readonly onRequest: () => void
}>

function formatMoment(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(parsed))
}

/**
 * A janela e o botão fecham a mesma linha de `job_executions`, e é ela que aparece aqui: sem a
 * última execução, o ciclo agendado seria invisível para quem só olha a tela.
 */
function LastJobRun({ run }: Readonly<{ run: NfeJobRunSnapshot | null | undefined }>) {
  const { t } = useTranslation('nfeWorkspace')
  if (run === undefined) return null
  if (run === null) {
    return (
      <p className={styles.distributionMeta} role="status">
        {t('distribution.lastJobRunNever')}
      </p>
    )
  }
  const origin = t(`distribution.jobOrigin.${run.origin}`)
  return (
    <p className={styles.distributionMeta} role="status">
      {run.finishedAt === null || run.outcome === null
        ? t('distribution.lastJobRunRunning', { origin, when: formatMoment(run.startedAt) })
        : t('distribution.lastJobRun', {
            origin,
            outcome: t(`distribution.jobOutcome.${run.outcome}`),
            when: formatMoment(run.finishedAt),
          })}
    </p>
  )
}

export function NfeDistributionControl(props: NfeDistributionControlProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { pullControl } = props
  const cooldownTargetIso =
    pullControl.tone === 'cooldown' ? (pullControl.nextAllowedAt ?? null) : null
  const countdownSeconds = useCountdown({
    onComplete: props.onCooldownEnd,
    targetIso: cooldownTargetIso,
  })

  if (!props.canImport) {
    return null
  }

  return (
    <section className={styles.distributionPanel} aria-labelledby="nfe-distribution-title">
      <div className={styles.panelHeading}>
        <h2 id="nfe-distribution-title">{t('distribution.emergencyTitle')}</h2>
        <p>{t('distribution.emergencySubtitle')}</p>
      </div>
      <p className={styles.distributionMeta} role="status">
        {pullControl.lastPulledAt === null
          ? t('distribution.lastPullNever')
          : t('distribution.lastPull', { when: formatMoment(pullControl.lastPulledAt) })}
      </p>
      <LastJobRun run={props.lastRun} />
      <div className={styles.actionRow}>
        <button
          className={styles.secondaryAction}
          disabled={props.pending || !pullControl.canTrigger}
          onClick={props.onRequest}
          type="button"
        >
          <Icon name="refresh" />
          {props.pending ? t('distribution.pending') : t('distribution.submit')}
        </button>
      </div>
      <p
        className={
          pullControl.tone === 'ready' ? styles.distributionReady : styles.distributionWarning
        }
        role={pullControl.tone === 'ready' ? 'status' : 'alert'}
      >
        {pullControl.tone === 'ready' && t('distribution.ready')}
        {pullControl.tone === 'busy' && t('distribution.busy')}
        {pullControl.tone === 'cooldown' &&
          t('distribution.cooldown', { countdown: formatCountdown(countdownSeconds) })}
        {pullControl.tone === 'unavailable' && t('distribution.unavailable')}
      </p>
    </section>
  )
}
