import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { fractionToPercentage } from '@/modules/shared/fractionPercentage.service'

import { formatMargin, isNegative } from '../shared/financialView.service'
import { composeCostParcelDetail, type Translate } from '../shared/tripCostParcelDetail.service'
import type { TripValuation } from '../shared/tripValuation.service'
import {
  buildValuationLedger,
  type GapRemedy,
  type ValuationLedgerLine,
} from '../shared/valuationLedger.service'
import styles from '../styles/tripFinancials.module.css'

/**
 * O remédio da lacuna, como a tela hospedeira sabe executá-lo.
 *
 * ⚠️ **Sempre `onAct`, nunca uma âncora.** A navegação deste shell é manual (`pushPath` +
 * `rememberWorkspace` + `popstate`): um `href` cru recarregaria a app inteira e ainda abriria o
 * workspace errado, porque `main.tsx` decide a tela pelo que foi lembrado, não só pelo caminho.
 */
export type GapAction = Readonly<{ isPending?: boolean; onAct: () => void }>

export type GapActions = Partial<Record<GapRemedy, GapAction>>

type ValuationLedgerProps = Readonly<{
  /**
   * Opcional de propósito. A proposta multi-veículo e a criação manual desenham o razão **sem**
   * ações: ali a lacuna continua texto puro, porque planejar rota ou lançar gasto só existe depois
   * que a viagem existe — oferecer o botão seria mandar procurar o que não há.
   */
  gapActions?: GapActions | undefined
  valuation: null | TripValuation
}>

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
export function ValuationLedger({ gapActions, valuation }: ValuationLedgerProps) {
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
        <LedgerLine key={line.kind} gapActions={gapActions} line={line} />
      ))}

      {ledger.taxes.length === 0 ? null : (
        <>
          <p className={styles.ledgerGroup}>{t('ledger.taxes')}</p>
          {ledger.taxes.map((line) => (
            <LedgerLine key={line.kind} gapActions={gapActions} line={line} />
          ))}
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
function LedgerLine({
  gapActions,
  line,
}: Readonly<{ gapActions: GapActions | undefined; line: ValuationLedgerLine }>) {
  const { t } = useTranslation('tripFinancials')
  const basis = line.basis
  /**
   * Spec 143: a diária do motorista (`basis.of === 'driver'`) é dado cru — a frase é composta
   * aqui, no mesmo serviço que a proposta usa, para as duas telas nunca discordarem.
   */
  const detail = composeCostParcelDetail({ basis, detail: line.detail, t: t as Translate })
  const action = line.remedy === null ? undefined : gapActions?.[line.remedy]
  const gapText = `${t(`gap.${line.gap}`, { defaultValue: line.gap })}${detail === null ? '' : ` — ${detail}`}`

  return (
    <>
      <div className={styles.ledgerRow}>
        <dt>{t(`parcel.${line.kind}`, line.kind)}</dt>
        {line.gap === null || line.isAdvisory ? (
          <dd>
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
            {/*
              O motivo vira o próprio botão onde há remédio: quem lê "roteiro ainda não calculado"
              está a um clique de calculá-lo, em vez de sair procurando a tela. Sem ação — proposta,
              criação manual, lacuna sem remédio — o `<dd>` continua exatamente como antes.
            */}
            {action === undefined ? (
              gapText
            ) : (
              <Button
                className={styles.ledgerGapAction}
                disabled={action.isPending === true}
                onClick={action.onAct}
                size="sm"
                type="button"
                variant="ghost"
              >
                {gapText}
                <Icon name="chevron-right" />
                {t(`gapAction.${line.remedy}`)}
              </Button>
            )}
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
              : detail}
        </p>
      )}
      {line.isAdvisory ? (
        <p className={styles.ledgerAdvisory}>
          {t(`gap.${line.gap ?? ''}`, { defaultValue: line.gap ?? '' })}
          {detail === null ? '' : ` — ${detail}`}
        </p>
      ) : null}
    </>
  )
}
