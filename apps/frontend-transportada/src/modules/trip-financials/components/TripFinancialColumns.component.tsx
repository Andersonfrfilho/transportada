/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { TripFinancialResult } from '../shared/tripFinancials.types'
import { summarizeTripValuation, type TripValuation } from '../shared/tripValuation.service'
import { FrozenResultTable } from './FrozenResultTable.component'
import { ValuationLedger, type GapActions } from './ValuationLedger.component'
import styles from '../styles/tripFinancials.module.css'

type TripFinancialColumnsProps = Readonly<{
  gapActions?: GapActions | undefined
  /** `null` na viagem aberta: o fechado ainda não existe, e a coluna diz isso em vez de ficar vazia. */
  result: TripFinancialResult | null
  valuation: TripValuation | null
}>

/**
 * Spec 226 D6: a conta **prevista** e a conta **fechada**, cada uma sob o próprio rótulo. Lado a
 * lado em tela larga, uma sobre a outra em tela estreita.
 */
export function TripFinancialColumns({ gapActions, result, valuation }: TripFinancialColumnsProps) {
  const { t } = useTranslation('tripFinancials')
  const expected = summarizeTripValuation(valuation)

  return (
    <div className={styles.sideBySide}>
      <section aria-labelledby="trip-financial-expected" className={styles.column}>
        <h3 id="trip-financial-expected">{t('comparison.expected')}</h3>
        {expected === null ? null : (
          <>
            <ValuationLedger gapActions={gapActions} valuation={valuation} />
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

      <section aria-labelledby="trip-financial-closed" className={styles.column}>
        <h3 id="trip-financial-closed">{t('comparison.closed')}</h3>
        {result === null ? (
          <p className={styles.hint}>{t('panel.notFrozen')}</p>
        ) : (
          <FrozenResultTable result={result} />
        )}
      </section>
    </div>
  )
}
