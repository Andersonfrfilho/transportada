/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type { DeliveryProof } from '../shared/deliveryProof.service'
import styles from '../styles/trip.module.css'

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export function formatMoment(value: string): string {
  return momentFormatter.format(new Date(value))
}

const PUNCTUALITY_BADGE_VARIANT = {
  on_time: 'success',
  late: 'warning',
  away: 'warning',
  late_and_away: 'warning',
} as const

const METERS_PER_KILOMETER = 1000
const distanceFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** Spec 220 RF13-RF16: comprovante antigo não traz nenhuma destas leituras, então cada uma é opcional. */
export function ProofReadings({ proof }: Readonly<{ proof: DeliveryProof }>) {
  const { t } = useTranslation('trip')
  const { capturedAt, distanceMeters, lateRegistration, punctuality, receivedBy } = proof
  const hasPunctualityBadge = punctuality !== undefined && punctuality !== 'not_required'

  return (
    <div className={styles.hint}>
      {capturedAt === undefined ? null : (
        <p>{t('deliveryProof.capturedAt', { moment: formatMoment(capturedAt) })}</p>
      )}
      <p>{describeDistance(distanceMeters, t)}</p>
      {hasPunctualityBadge || lateRegistration === true ? (
        <div className={styles.proofBadges}>
          {hasPunctualityBadge ? (
            <Badge variant={PUNCTUALITY_BADGE_VARIANT[punctuality]}>
              {t(`deliveryProof.punctuality.${punctuality}`)}
            </Badge>
          ) : null}
          {lateRegistration === true ? (
            <Badge variant="secondary">{t('deliveryProof.lateRegistration')}</Badge>
          ) : null}
        </div>
      ) : null}
      {receivedBy === undefined || receivedBy === null ? null : (
        <p>
          {t('deliveryProof.receivedBy', {
            relation: t(`deliveryProof.receivedByOptions.${receivedBy}`),
          })}
        </p>
      )}
    </div>
  )
}

function describeDistance(distanceMeters: number | undefined, t: TFunction<'trip'>): string {
  if (distanceMeters === undefined) return t('deliveryProof.withoutLocation')
  if (distanceMeters < METERS_PER_KILOMETER) {
    return t('deliveryProof.distanceMeters', {
      distance: distanceFormatter.format(Math.round(distanceMeters)),
    })
  }
  return t('deliveryProof.distanceKilometers', {
    distance: distanceFormatter.format(distanceMeters / METERS_PER_KILOMETER),
  })
}
