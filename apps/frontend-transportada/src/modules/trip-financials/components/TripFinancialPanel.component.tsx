/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  countUnknownParcels,
  describeRevenueCoverage,
  formatMargin,
  isNegative,
  splitParcels,
} from '../shared/financialView.service'
import type { TripFinancialResult } from '../shared/tripFinancials.types'
import styles from '../styles/tripFinancials.module.css'

type TripFinancialPanelProps = Readonly<{
  isLoading: boolean
  onRecalculate: (reason: string) => Promise<void>
  result: TripFinancialResult | null
}>

/**
 * Spec 061 P1: **a viagem mostra a conta** — receita, cada parcela com sua origem, o total e a
 * margem. O painel só existe para quem tem `trip.financials`: quem monta viagem decide pela
 * avaliação prevista, que não mostra o que se paga ao agregado (ADR-0049 §6).
 */
export function TripFinancialPanel({ isLoading, onRecalculate, result }: TripFinancialPanelProps) {
  const { t } = useTranslation('tripFinancials')
  const [reason, setReason] = useState('')
  const [isRecalculating, setIsRecalculating] = useState(false)

  if (isLoading) {
    return (
      <SkeletonGroup label={t('panel.loading')}>
        <Skeleton height="10rem" />
      </SkeletonGroup>
    )
  }

  /** Viagem aberta não tem congelado, e dizer isso é melhor que mostrar zeros como conta fechada. */
  if (result === null) {
    return (
      <section className={styles.panel}>
        <h2>{t('panel.title')}</h2>
        <p className={styles.hint}>{t('panel.notFrozen')}</p>
      </section>
    )
  }

  const { costs, taxes } = splitParcels(result)
  const coverage = describeRevenueCoverage(result)
  const unknown = countUnknownParcels(result)
  const margin = formatMargin(result.marginRate)

  async function handleRecalculate(): Promise<void> {
    setIsRecalculating(true)
    try {
      await onRecalculate(reason)
      setReason('')
    } finally {
      setIsRecalculating(false)
    }
  }

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2>{t('panel.title')}</h2>
        <p className={styles.hint}>
          {t('panel.frozenAt', { date: result.frozenAt.slice(0, 10), version: result.version })}
        </p>
        {/* A margem aqui é operacional: ela desce imposto sobre o frete, não folha nem contábil. */}
        <p className={styles.hint}>{t('panel.operationalNote')}</p>
      </header>

      <dl className={styles.totals}>
        <div>
          <dt>{t('panel.revenue')}</dt>
          <dd>{result.revenueAmount}</dd>
        </div>
        <div>
          <dt>{t('panel.tax')}</dt>
          <dd>{result.taxTotal}</dd>
        </div>
        <div>
          <dt>{t('panel.cost')}</dt>
          <dd>{result.costTotal}</dd>
        </div>
        <div>
          <dt>{t('panel.net')}</dt>
          <dd className={isNegative(result.netAmount) ? styles.negative : undefined}>
            {result.netAmount}
            {margin === null ? '' : ` · ${margin}`}
          </dd>
        </div>
      </dl>

      {coverage === null ? null : (
        <p className={styles.warning} role="status">
          {t('panel.partialRevenue', coverage)}
        </p>
      )}
      {unknown === 0 ? null : (
        <p className={styles.warning} role="status">
          {t('panel.unknownParcels', { count: unknown })}
        </p>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('panel.parcel')}</th>
            <th scope="col">{t('panel.amount')}</th>
            <th scope="col">{t('panel.source')}</th>
          </tr>
        </thead>
        <tbody>
          {[...taxes, ...costs].map((parcel) => (
            <tr key={parcel.kind}>
              <td>{t(`parcel.${parcel.kind}`)}</td>
              <td>{parcel.amount}</td>
              <td>
                {t(`source.${parcel.source}`)}
                {parcel.note === ''
                  ? ''
                  : ` · ${t(`gap.${parcel.note}`, { defaultValue: parcel.note })}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.recalculate}>
        <label className={styles.field}>
          {t('panel.reason')}
          <input
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('panel.reasonPlaceholder')}
            value={reason}
          />
        </label>
        {/* Recalcular exige motivo: número que muda sem explicação é pergunta sem resposta. */}
        <Button
          disabled={reason.trim() === '' || isRecalculating}
          onClick={() => void handleRecalculate()}
          type="button"
          variant="ghost"
        >
          <Icon name="refresh" />
          {isRecalculating ? t('panel.recalculating') : t('panel.recalculate')}
        </Button>
      </div>
    </section>
  )
}
