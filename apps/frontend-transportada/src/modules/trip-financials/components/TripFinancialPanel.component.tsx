/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { TripCostEntriesController } from '../hooks/useTripCostEntries.hook'
import type { TripRevenueEntriesController } from '../hooks/useTripRevenueEntries.hook'
import type { TripFinancialResult } from '../shared/tripFinancials.types'
import { summarizeTripValuation, type TripValuation } from '../shared/tripValuation.service'
import { FrozenResultTable } from './FrozenResultTable.component'
import { TripCostEntries } from './TripCostEntries.component'
import { TripRevenueEntries } from './TripRevenueEntries.component'
import { ValuationLedger } from './ValuationLedger.component'
import styles from '../styles/tripFinancials.module.css'

type TripFinancialPanelProps = Readonly<{
  /** Os lançamentos avulsos da viagem — a lista vive dentro do painel, e só dentro dele. */
  costEntries: TripCostEntriesController
  isError: boolean
  isLoading: boolean
  onRecalculate: (reason: string) => Promise<void>
  onRetry: () => void
  result: TripFinancialResult | null
  /**
   * Spec 169 P1/RF4: a receita lançada, em linha separada do frete previsto — opcional para não
   * quebrar quem ainda não monta o controller (spec 169 não altera `TripDetail.page.tsx`).
   */
  revenueEntries?: TripRevenueEntriesController
  /** A conta prevista da viagem aberta — é ela que aparece enquanto não há congelada. */
  valuation: TripValuation | null
}>

/**
 * Spec 169 RF11: os dois blocos de lançamento, juntos — extraídos para caber no teto de 200
 * linhas do repositório, e para nascer sempre **antes** do total (CA08): o total é a conclusão,
 * e conclusão não vem antes do que a compõe.
 */
function LaunchedEntries({
  costEntries,
  revenueEntries,
}: Readonly<{
  costEntries: TripCostEntriesController
  revenueEntries: TripRevenueEntriesController | undefined
}>) {
  return (
    <>
      <TripCostEntries
        canRecord={costEntries.canRecord}
        entries={costEntries.entries}
        entryKinds={costEntries.entryKinds}
        isError={costEntries.isError}
        isLoading={costEntries.isLoading}
        isRecording={costEntries.isRecording}
        isRemoving={costEntries.isRemoving}
        onRecord={costEntries.record}
        onRemove={costEntries.remove}
        onRetry={costEntries.retry}
      />
      {revenueEntries === undefined ? null : (
        <TripRevenueEntries
          canRecord={revenueEntries.canRecord}
          entries={revenueEntries.entries}
          entryKinds={revenueEntries.entryKinds}
          isError={revenueEntries.isError}
          isLoading={revenueEntries.isLoading}
          isRecording={revenueEntries.isRecording}
          isRemoving={revenueEntries.isRemoving}
          onRecord={revenueEntries.record}
          onRemove={revenueEntries.remove}
          onRetry={revenueEntries.retry}
        />
      )}
    </>
  )
}

/**
 * Spec 061 P1: **a viagem mostra a conta** — receita, cada parcela com sua origem, o total e a
 * margem. O painel só existe para quem tem `trip.financials`: quem monta viagem decide pela
 * avaliação prevista, que não mostra o que se paga ao agregado (ADR-0049 §6).
 */
export function TripFinancialPanel({
  costEntries,
  isError,
  isLoading,
  onRecalculate,
  onRetry,
  result,
  revenueEntries,
  valuation,
}: TripFinancialPanelProps) {
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

  if (isError) {
    return (
      <section className={styles.panel}>
        <h2>{t('panel.title')}</h2>
        <p className={styles.hint} role="alert">
          {t('panel.error')}
        </p>
        <Button onClick={onRetry} size="sm" type="button" variant="ghost">
          <Icon name="refresh" />
          {t('panel.retry')}
        </Button>
      </section>
    )
  }

  /** Viagem aberta não tem congelado — o painel mostra a prevista até ela fechar. */
  if (result === null) {
    const expected = summarizeTripValuation(valuation)

    return (
      <section className={styles.panel}>
        <h2>{t('panel.title')}</h2>
        <p className={styles.hint}>{t('panel.notFrozen')}</p>
        {/* RF11/CA08: os lançamentos vêm antes do total — aqui, a prévia (ValuationLedger). */}
        <LaunchedEntries costEntries={costEntries} revenueEntries={revenueEntries} />
        {expected === null ? null : (
          <>
            <ValuationLedger valuation={valuation} />
            {/* A lacuna vai junto do número: total sem parcela sai menor do que a viagem custa. */}
            {expected.hasGaps ? (
              <p className={styles.hint}>
                {t('panel.expectedGaps', {
                  reasons: expected.gaps.map((gap) => t(`gap.${gap}`, gap)).join(', '),
                })}
              </p>
            ) : null}
          </>
        )}
      </section>
    )
  }

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

      {/* RF11/CA08: os lançamentos vêm antes do total — aqui, o resultado congelado. */}
      <LaunchedEntries costEntries={costEntries} revenueEntries={revenueEntries} />

      <FrozenResultTable result={result} />

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
