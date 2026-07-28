/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useCountdown } from '../hooks/useCountdown.hook'
import {
  type NfeDistributionPullControl,
  formatCountdown,
} from '../shared/nfeDistributionPull.service'
import styles from '../styles/nfeWorkspace.module.css'

type NfeDistributionControlProps = Readonly<{
  readonly canImport: boolean
  readonly pending: boolean
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
      <div className={styles.actionRow}>
        <button
          className={styles.secondaryAction}
          disabled={props.pending || !pullControl.canTrigger}
          onClick={props.onRequest}
          type="button"
        >
          <DistributionIcon />
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

function DistributionIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M4 7h11" />
      <path d="m12 4 3 3-3 3" />
      <path d="M20 17H9" />
      <path d="m12 14-3 3 3 3" />
    </svg>
  )
}
