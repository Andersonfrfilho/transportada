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

type ProofReadingsProps = Readonly<{
  /** A baixa já está dita na linha-resumo: captura no mesmo minuto não ganha uma segunda leitura. */
  deliveredAt?: null | string | undefined
  proof: DeliveryProof
}>

/** Spec 220 RF13-RF16: comprovante antigo não traz nenhuma destas leituras, então cada uma é opcional. */
export function ProofReadings({ deliveredAt, proof }: ProofReadingsProps) {
  const { t } = useTranslation('trip')
  const formatMoment = useMomentFormatter()
  const { capturedAt, distanceMeters, lateRegistration, receivedBy } = proof
  const hasDistinctCapture =
    capturedAt !== undefined &&
    (deliveredAt === null || deliveredAt === undefined
      ? true
      : formatMoment(capturedAt) !== formatMoment(deliveredAt))

  return (
    <div className={styles.proofReadings}>
      <dl className={styles.proofMetadata}>
        {hasDistinctCapture ? (
          <ReadingCell label={t('deliveryProof.readings.capturedAt')}>
            {formatMoment(capturedAt)}
          </ReadingCell>
        ) : null}
        {distanceMeters === undefined ? null : (
          <ReadingCell
            isAlert={isDeliveryProofAwayFromDeliveryEvent(proof)}
            label={t('deliveryProof.readings.distance')}
          >
            {describeDistance(distanceMeters, t)}
          </ReadingCell>
        )}
        {receivedBy === undefined || receivedBy === null ? null : (
          <ReadingCell label={t('deliveryProof.readings.receiverRelation')}>
            {t(`deliveryProof.receivedByOptions.${receivedBy}`)}
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
