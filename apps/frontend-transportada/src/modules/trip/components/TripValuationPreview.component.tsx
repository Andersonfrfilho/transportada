/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { ValuationLedger } from '@/modules/trip-financials/components/ValuationLedger.component'
import type { TripValuationPreviewController } from '@/modules/trip-financials/hooks/useTripValuationPreview.hook'

import styles from '../styles/trip.module.css'

type TripValuationPreviewProps = Readonly<{ preview: TripValuationPreviewController }>

/**
 * O que a viagem rende e o que ela custa, **antes** de ela existir. Quem monta o roteiro decide se
 * vale a pena montá-lo, e a receita sozinha não responde isso.
 *
 * Sem a permissão o bloco não existe — não é um bloco vazio nem um "—", porque dinheiro tem
 * permissão própria e mostrar a moldura já diria que há número do outro lado.
 *
 * ⚠️ Spec 110 D8: **daqui para baixo quem desenha é `ValuationLedger`**, o mesmo componente que a
 * proposta multi-veículo usa. Este arquivo ficou sendo só a permissão, o esqueleto e o vazio — as
 * três coisas que a proposta resolve de outro jeito. Duas implementações da mesma conta divergem
 * caladas, e foi assim que o preço do combustível passou a ler só o ajuste manual enquanto a ficha
 * do veículo lia o efetivo (spec 100).
 */
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

  if (preview.summary === null) {
    return <p className={styles.hint}>{t('valuation.empty')}</p>
  }

  return (
    <section className={styles.valuation} aria-label={t('valuation.title')}>
      <ValuationLedger valuation={preview.valuation} />
    </section>
  )
}
