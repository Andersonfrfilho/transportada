/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { formatMargin, isNegative } from '@/modules/trip-financials/shared/financialView.service'
import type { TripValuationPreviewController } from '@/modules/trip-financials/hooks/useTripValuationPreview.hook'
import type { TripValuationCostParcel } from '@/modules/trip-financials/shared/tripValuation.service'

import { buildValuationSteps } from '../shared/valuationSteps.service'
import styles from '../styles/trip.module.css'

type TripValuationPreviewProps = Readonly<{ preview: TripValuationPreviewController }>

/**
 * O que a viagem rende e o que ela custa, **antes** de ela existir. Quem monta o roteiro decide se
 * vale a pena montá-lo, e a receita sozinha não responde isso.
 *
 * Sem a permissão o bloco não existe — não é um bloco vazio nem um "—", porque dinheiro tem
 * permissão própria e mostrar a moldura já diria que há número do outro lado.
 */
/**
 * Uma linha da conta. A parcela sem valor **não some**: ela aparece com o motivo no lugar do número,
 * porque some é o que faz um total incompleto parecer completo.
 */
function ParcelRow({ parcel }: Readonly<{ parcel: TripValuationCostParcel }>) {
  const { t } = useTranslation('trip')
  const { t: tFinanceiro } = useTranslation('tripFinancials')

  return (
    <div className={styles.valuationStep}>
      <span>{tFinanceiro(`parcel.${parcel.kind}`, parcel.kind)}</span>
      {parcel.gap === null ? (
        <span>{formatAmount(parcel.amount)}</span>
      ) : (
        <span className={styles.valuationStepGap}>
          {t(`valuation.gap.${parcel.gap}`, parcel.gap)}
        </span>
      )}
    </div>
  )
}

export function TripValuationPreview({ preview }: TripValuationPreviewProps) {
  const { t } = useTranslation('trip')

  if (!preview.canRead) return null

  if (preview.isLoading) {
    return (
      <SkeletonGroup className={styles.valuation} label={t('valuation.loading')}>
        <Skeleton variant="text" width="8rem" />
        <Skeleton variant="text" width="12rem" />
      </SkeletonGroup>
    )
  }

  const { summary, valuation } = preview
  const steps = valuation === null ? null : buildValuationSteps(valuation)

  if (summary === null) {
    return <p className={styles.hint}>{t('valuation.empty')}</p>
  }

  return (
    <section className={styles.valuation} aria-label={t('valuation.title')}>
      <dl className={styles.valuationTotals}>
        <div>
          <dt>{t('valuation.revenue')}</dt>
          <dd>{formatAmount(summary.revenue)}</dd>
        </div>
        <div>
          <dt>{t('valuation.cost')}</dt>
          <dd>{formatAmount(summary.cost)}</dd>
        </div>
        <div>
          <dt>{t('valuation.margin')}</dt>
          <dd className={isNegative(summary.margin) ? styles.negative : undefined}>
            {formatAmount(summary.margin)}
            {summary.marginPercentage === null
              ? null
              : ` (${formatMargin(summary.marginPercentage)})`}
          </dd>
        </div>
      </dl>

      {/*
        Os passos ficam **abaixo** dos totais: quem só quer decidir lê os três números e para; quem
        quer entender de onde eles vieram continua descendo. Esconder o detalhe atrás de um clique
        faria a lacuna — que é o que explica o total baixo — precisar ser procurada.
      */}
      {steps === null ? null : (
        <div className={styles.valuationSteps}>
          <h3 className={styles.valuationStepsTitle}>{t('valuation.operating')}</h3>
          {steps.operating.parcels.map((parcel) => (
            <ParcelRow key={parcel.kind} parcel={parcel} />
          ))}

          {steps.taxes.parcels.length === 0 ? null : (
            <>
              {/* ADR-0049 §4: imposto **desce da receita**, não é gasto de rodar — e a tela separa. */}
              <h3 className={styles.valuationStepsTitle}>{t('valuation.taxes')}</h3>
              {steps.taxes.parcels.map((parcel) => (
                <ParcelRow key={parcel.kind} parcel={parcel} />
              ))}
            </>
          )}
        </div>
      )}

      {summary.hasGaps ? (
        <p className={styles.hint}>
          {t('valuation.gaps', {
            reasons: summary.gaps.map((gap) => t(`valuation.gap.${gap}`, gap)).join(', '),
          })}
        </p>
      ) : null}
    </section>
  )
}
