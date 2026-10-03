/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useCargoArrivalDetail } from '../hooks/useCargoArrivalDetail.hook'
import styles from '../styles/cargoReceiving.module.css'
import { CargoArrivalDetailContent } from './CargoArrivalDetailContent.component'

type CargoArrivalDetailScreenProps = Readonly<{
  arrivalId: string
  /** `trip.manage`: quem só lê vê os grupos e o progresso, mas não seleciona nem age. */
  canManage: boolean
}>

/** O detalhe do escritório: carrega a chegada e entrega ao conteúdo. Chegada fechada é só leitura. */
export function CargoArrivalDetailScreen({
  arrivalId,
  canManage,
}: CargoArrivalDetailScreenProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const detail = useCargoArrivalDetail(arrivalId)

  if (detail.isLoading) {
    return (
      <SkeletonGroup label={t('detail.loading')}>
        <Skeleton height="6rem" />
        <Skeleton height="10rem" />
      </SkeletonGroup>
    )
  }
  if (detail.arrival === undefined) {
    return (
      <p className={styles.error} role="alert">
        {t('detail.error', { code: detail.errorCode ?? '' })}
      </p>
    )
  }
  return (
    <CargoArrivalDetailContent arrival={detail.arrival} canManage={canManage} detail={detail} />
  )
}
