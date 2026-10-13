/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import {
  resolveOccurrenceTakenByView,
  type OccurrenceTakenByView,
} from '../shared/occurrenceTakenBy.service'
import type { TripOccurrenceCaseView } from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'

export type OccurrenceCaseTakenByProps = Readonly<{
  occurrenceCase: null | TripOccurrenceCaseView
  /** `block` abre a tratativa (avatar, nome, desde quando); `inline` cabe numa célula ou linha. */
  variant: 'block' | 'inline'
}>

type Tone = 'attention' | 'neutral' | 'ready'

function resolveTone(view: OccurrenceTakenByView): Tone {
  if (view.kind === 'taken') return 'ready'
  if (view.kind === 'waiting' && view.isStale) return 'attention'
  return 'neutral'
}

function resolveIconName(view: OccurrenceTakenByView): 'alert' | 'check' | 'clock' {
  if (view.kind === 'taken') return 'check'
  return view.kind === 'waiting' && view.isStale ? 'alert' : 'clock'
}

function resolveHintKey(view: OccurrenceTakenByView): string {
  if (view.kind === 'taken') return 'occurrenceTakenBy.hint.taken'
  if (view.kind === 'waiting') {
    return view.isStale ? 'occurrenceTakenBy.hint.stale' : 'occurrenceTakenBy.hint.waiting'
  }
  return 'occurrenceTakenBy.hint.none'
}

/**
 * Spec 164 (quem pegou): estado é ícone + palavra + cor. Quem pegou é quem iniciou a validação
 * interna; antes disso a palavra é "Ninguém pegou ainda", e passadas algumas horas ela vira aviso
 * âmbar. O nome é o do perfil — a API nunca manda e-mail nem telefone.
 */
export function OccurrenceCaseTakenBy({ occurrenceCase, variant }: OccurrenceCaseTakenByProps) {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const [now] = useState(() => Date.now())
  const view = resolveOccurrenceTakenByView({ now, occurrenceCase })

  if (view === null) return null

  const tone = resolveTone(view)
  const iconName = resolveIconName(view)
  const hint = t(resolveHintKey(view), { hours: view.kind === 'waiting' ? view.hoursWaiting : 0 })

  if (view.kind === 'taken') {
    const name = view.name ?? t('occurrenceTakenBy.unknownName')
    if (variant === 'inline') {
      return (
        <Tooltip label={hint}>
          <span className={styles.takenByInline} data-tone={tone} tabIndex={0}>
            <Icon name={iconName} />
            <span>{name}</span>
          </span>
        </Tooltip>
      )
    }
    return (
      <Tooltip label={hint}>
        <div
          aria-label={t('occurrenceTakenBy.title')}
          className={styles.takenByBlock}
          data-tone={tone}
          role="group"
          tabIndex={0}
        >
          <span aria-hidden="true" className={styles.takenByAvatar}>
            {view.initials === '' ? <Icon name={iconName} /> : view.initials}
          </span>
          <span className={styles.takenByText}>
            <span className={styles.takenByLabel}>
              <Icon name={iconName} />
              {t('occurrenceTakenBy.taken')}
            </span>
            <strong>{name}</strong>
            <span className={styles.takenBySince}>
              {t('occurrenceTakenBy.since', { moment: formatMoment(view.takenAt) })}
            </span>
          </span>
        </div>
      </Tooltip>
    )
  }

  const label =
    view.kind === 'waiting' ? t('occurrenceTakenBy.waiting') : t('occurrenceTakenBy.none')
  const detail =
    view.kind === 'waiting'
      ? view.isStale
        ? t('occurrenceTakenBy.stale', { hours: view.hoursWaiting })
        : t('occurrenceTakenBy.waitingSince', { moment: formatMoment(view.since) })
      : null

  if (variant === 'inline') {
    return (
      <Tooltip label={hint}>
        <span className={styles.takenByInline} data-tone={tone} tabIndex={0}>
          <Icon name={iconName} />
          <span>{label}</span>
        </span>
      </Tooltip>
    )
  }
  return (
    <Tooltip label={hint}>
      <div
        aria-label={t('occurrenceTakenBy.title')}
        className={styles.takenByBlock}
        data-tone={tone}
        role={tone === 'attention' ? 'status' : 'group'}
        tabIndex={0}
      >
        <span aria-hidden="true" className={styles.takenByAvatar}>
          <Icon name={iconName} />
        </span>
        <span className={styles.takenByText}>
          <strong>{label}</strong>
          {detail === null ? null : <span className={styles.takenBySince}>{detail}</span>}
        </span>
      </div>
    </Tooltip>
  )
}
