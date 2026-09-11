/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { fractionToPercentage } from '@/modules/shared/fractionPercentage.service'

import { formatMargin, isNegative } from '../shared/financialView.service'
import type { TripValuation } from '../shared/tripValuation.service'
import { buildValuationLedger, type ValuationLedgerLine } from '../shared/valuationLedger.service'
import styles from '../styles/tripFinancials.module.css'

type ValuationLedgerProps = Readonly<{ valuation: null | TripValuation }>

/**
 * Spec 110 D7: **a conta numa coluna, e cada custo com a derivação na linha de baixo.**
 *
 * ⚠️ É o **mesmo** componente na proposta multi-veículo e na criação manual. Duas implementações da
 * mesma conta divergem caladas, e `test/trip/valuation-ledger-shared.contract.ts` reprova quem
 * escrever a segunda.
 *
 * ⚠️ **Despesas em `--color-alert`**, lucro em `--color-ready`: os dois números que decidem a viagem
 * se distinguem antes de o rótulo ser lido.
 */
export function ValuationLedger({ valuation }: ValuationLedgerProps) {
  const ledger = buildValuationLedger(valuation)
  const { t } = useTranslation('tripFinancials')

  if (ledger === null) return null

  return (
    <dl className={styles.ledger}>
      <div className={`${styles.ledgerRow} ${styles.ledgerRevenue}`}>
        <dt>{t('ledger.revenue')}</dt>
        <dd>{formatAmount(ledger.totalRevenue)}</dd>
      </div>

      <p className={styles.ledgerGroup}>{t('ledger.operating')}</p>
      {ledger.operating.map((line) => (
        <LedgerLine key={line.kind} line={line} />
      ))}

      {ledger.taxes.length === 0 ? null : (
        <>
          <p className={styles.ledgerGroup}>{t('ledger.taxes')}</p>
          {ledger.taxes.map((line) => (
            <LedgerLine key={line.kind} line={line} />
          ))}
          {/* ADR-0049 §4: dizer por que eles não estão somados com a operação, uma vez só. */}
          <p className={styles.ledgerDetail}>{t('ledger.taxNote')}</p>
        </>
      )}

      <div className={`${styles.ledgerRow} ${styles.ledgerTotal}`}>
        <dt>{t('ledger.expenses')}</dt>
        <dd className={styles.ledgerExpenses}>{formatAmount(ledger.totalCost)}</dd>
      </div>
      <div className={`${styles.ledgerRow} ${styles.ledgerTotal}`}>
        <dt>{t('ledger.margin')}</dt>
        <dd className={isNegative(ledger.totalMargin) ? styles.negative : styles.ledgerProfit}>
          {formatAmount(ledger.totalMargin)}
          {ledger.marginPercentage === null ? '' : ` · ${formatMargin(ledger.marginPercentage)}`}
        </dd>
      </div>
      {/*
        ⚠️ A marca depende de `hasGaps` e de nada mais: uma condição a mais é o caminho pelo qual ela
        desaparece sem ninguém notar, e o total volta a se apresentar como previsão fechada.
      */}
      {ledger.hasGaps ? <p className={styles.ledgerIncomplete}>{t('ledger.incomplete')}</p> : null}
    </dl>
  )
}

/**
 * Uma linha do razão: o custo, e — quando ele é **derivado** — de onde ele veio, logo abaixo.
 *
 * ⚠️ A frase é composta **aqui**, não na API: ela traduz, formata por locale e quebra em duas
 * linhas, e nada disso a API tem como fazer.
 */
function LedgerLine({ line }: Readonly<{ line: ValuationLedgerLine }>) {
  const { t } = useTranslation('tripFinancials')
  const basis = line.basis

  return (
    <>
      <div className={styles.ledgerRow}>
        <dt>{t(`parcel.${line.kind}`, line.kind)}</dt>
        {line.gap === null || line.isAdvisory ? (
          <dd>
            {/* Projeção sai marcada: o número conta no total, e não se confunde com apuração. */}
            {line.isEstimated ? (
              <span className={styles.ledgerEstimated}>{t('source.estimated')}</span>
            ) : null}
            {formatAmount(line.amount ?? '0.00')}
          </dd>
        ) : (
          <dd
            className={
              line.isGapStruckThrough
                ? `${styles.ledgerGap} ${styles.ledgerGapAbsent}`
                : styles.ledgerGap
            }
          >
            {t(`gap.${line.gap}`, { defaultValue: line.gap })}
            {line.detail === null ? '' : ` — ${line.detail}`}
          </dd>
        )}
      </div>
      {basis === null ? null : (
        <p className={styles.ledgerDetail}>
          {basis.of === 'fuel'
            ? t('ledger.fuelBasis', {
                consumption: basis.kilometersPerLiter,
                litres: basis.litres,
                price: formatAmount(basis.pricePerLiter),
              })
            : basis.of === 'icms'
              ? t('ledger.icmsBasis', {
                  cst: basis.cst,
                  rate: formatMargin(fractionToPercentage(basis.rate)),
                  reduction: formatMargin(fractionToPercentage(basis.baseReductionRate)),
                })
              : t(`ledger.driverBasis.${basis.paymentModel}`, {
                  city: basis.regionCity ?? '',
                  defaultValue: '',
                  vehicleClass: basis.vehicleClass,
                  zone: basis.regionCode ?? '',
                })}
        </p>
      )}
      {/* Spec 124: o aviso vem abaixo do número — ele diz o que cadastrar, não que falta valor. */}
      {line.isAdvisory ? (
        <p className={styles.ledgerAdvisory}>
          {t(`gap.${line.gap ?? ''}`, { defaultValue: line.gap ?? '' })}
          {line.detail === null ? '' : ` — ${line.detail}`}
        </p>
      ) : null}
    </>
  )
}
