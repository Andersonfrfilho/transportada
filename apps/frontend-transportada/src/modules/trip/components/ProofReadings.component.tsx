/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import type { DeliveryProof } from '../shared/deliveryProof.service'
import { isDeliveryProofAwayFromDeliveryEvent } from '../shared/deliveryProofCard.service'
import styles from '../styles/trip.module.css'

const METERS_PER_KILOMETER = 1000
const distanceFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function ReadingCell({
  children,
  isAlert = false,
  label,
}: Readonly<{ children: ReactNode; isAlert?: boolean; label: string }>) {
  return (
    <div className={styles.proofReadingCell}>
      <dt className={styles.proofReadingLabel}>{label}</dt>
      <dd className={styles.proofReadingValue} data-alert={isAlert ? 'true' : undefined}>
        {children}
      </dd>
    </div>
  )
}

/** Spec 220 RF13-RF16: comprovante antigo não traz nenhuma destas leituras, então cada uma é opcional. */
export function ProofReadings({ proof }: Readonly<{ proof: DeliveryProof }>) {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const { capturedAt, distanceMeters, lateRegistration, receivedBy } = proof

  return (
    <div className={styles.proofReadings}>
      <dl className={styles.proofMetadata}>
        {capturedAt === undefined ? null : (
          <ReadingCell label={t('deliveryProof.readings.capturedAt')}>
            {formatMoment(capturedAt)}
          </ReadingCell>
        )}
        {distanceMeters === undefined ? null : (
          <ReadingCell
            isAlert={isDeliveryProofAwayFromDeliveryEvent(proof)}
            label={t('deliveryProof.readings.distance')}
          >
            {describeDistance(distanceMeters, t)}
          </ReadingCell>
        )}
        {lateRegistration === true ? (
          <ReadingCell label={t('deliveryProof.readings.requirement')}>
            <span className={styles.proofBadges}>
              <Badge variant="secondary">{t('deliveryProof.lateRegistration')}</Badge>
            </span>
          </ReadingCell>
        ) : null}
      </dl>
      {distanceMeters === undefined ? (
        <p className={styles.hint}>{t('deliveryProof.withoutLocation')}</p>
      ) : null}
      {receivedBy === undefined || receivedBy === null ? null : (
        <p className={styles.hint}>
          {t('deliveryProof.receivedBy', {
            relation: t(`deliveryProof.receivedByOptions.${receivedBy}`),
          })}
        </p>
      )}
    </div>
  )
}

function describeDistance(distanceMeters: number, t: TFunction<'trip'>): string {
  if (distanceMeters < METERS_PER_KILOMETER) {
    return t('deliveryProof.distanceMeters', {
      distance: distanceFormatter.format(Math.round(distanceMeters)),
    })
  }
  return t('deliveryProof.distanceKilometers', {
    distance: distanceFormatter.format(distanceMeters / METERS_PER_KILOMETER),
  })
}
