/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { formatMargin, isNegative } from '@/modules/trip-financials/shared/financialView.service'
import type { Translate } from '@/modules/trip-financials/shared/tripCostParcelDetail.service'

import { buildSuggestionCostParcelLines } from '../shared/suggestionCostParcelLine.service'
import {
  buildDurationUnitLabels,
  formatDistance,
  formatDuration,
  type SuggestionVehicleValuation as VehicleValuation,
} from '../shared/suggestionValuation.service'
import styles from '../styles/routing.module.css'

type SuggestionVehicleValuationProps = Readonly<{
  isLoading: boolean
  valuation: null | VehicleValuation
}>

/**
 * Spec 101: o que esta viagem proposta rende e custa, ao lado das paradas dela.
 *
 * ⚠️ A parcela com lacuna **não some**: ela aparece com o motivo no lugar do número, porque sumir é
 * o que faz um total incompleto parecer completo — mesma regra do painel da montagem. Spec 143: a
 * parcela **derivada** também não some — a diária do motorista não tem lacuna e mesmo assim precisa
 * dizer de onde o número veio, aqui como no razão da viagem.
 */
export function SuggestionVehicleValuation({
  isLoading,
  valuation,
}: SuggestionVehicleValuationProps) {
  const { t } = useTranslation('routing')
  const { t: tFinanceiro } = useTranslation('tripFinancials')

  if (isLoading) {
    return (
      <SkeletonGroup className={styles.vehicleValuation} label={t('valuation.loading')}>
        <Skeleton variant="text" width="7rem" />
        <Skeleton variant="text" width="10rem" />
      </SkeletonGroup>
    )
  }

  if (valuation === null) return null

  const parcelLines = buildSuggestionCostParcelLines({
    parcels: valuation.valuation.costParcels,
    t: tFinanceiro as Translate,
  })
  const margin = formatMargin(valuation.valuation.marginPercentage)
  const distance = formatDistance(valuation.distanceMeters)
  const duration = formatDuration(valuation.durationSeconds, buildDurationUnitLabels(t))

  return (
    <dl className={styles.vehicleValuation}>
      <div>
        <dt>{t('valuation.revenue')}</dt>
        <dd className={styles.revenue}>{formatAmount(valuation.valuation.totalRevenue)}</dd>
      </div>
      <div>
        <dt>{t('valuation.cost')}</dt>
        <dd className={styles.expense}>{formatAmount(valuation.valuation.totalCost)}</dd>
      </div>
      <div>
        <dt>{t('valuation.margin')}</dt>
        <dd
          className={isNegative(valuation.valuation.totalMargin) ? styles.negative : styles.profit}
        >
          {formatAmount(valuation.valuation.totalMargin)}
          {margin === null ? '' : ` · ${margin}`}
        </dd>
      </div>
      <div>
        <dt>{t('valuation.road')}</dt>
        {/* ⚠️ Ausência é dita, nunca desenhada como zero: veículo sem perna conhecida na sugestão. */}
        <dd>
          {distance === null ? t('valuation.roadUnknown') : distance}
          {duration === null ? '' : ` · ${duration}`}
        </dd>
      </div>
      {parcelLines.map((line) => (
        <div className={styles.vehicleValuationParcel} key={line.kind}>
          <dt>{tFinanceiro(`parcel.${line.kind}`, line.kind)}</dt>
          <dd>
            {line.gap === null
              ? formatAmount(line.amount)
              : tFinanceiro(`gap.${line.gap}`, { defaultValue: line.gap })}
            {line.detail === null ? '' : ` — ${line.detail}`}
          </dd>
        </div>
      ))}
    </dl>
  )
}
