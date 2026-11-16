/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { STOP_ORDER_SOURCE } from '../shared/trip.constant'
import type { StopOrderErrorCode, StopOrderSource } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripStopOrderNoticeProps = Readonly<{
  /** Só quem gerencia a viagem e só enquanto ela é editável vê o botão (a mesma regra de arrastar a parada). */
  canOrder: boolean
  errorCode: null | StopOrderErrorCode | undefined
  isOrdering: boolean
  onOrder: () => void
  /** Ausente é a viagem anterior à 323 (ou API ainda sem o campo): tratada como nunca ordenada. */
  source: StopOrderSource | undefined
  stopCount: number
}>

/**
 * Spec 323 D4/RF4: quem decidiu a ordem das paradas e, quando o ordenador tentou e não conseguiu, por quê. A falha **nunca**
 * foi disfarçada de ordem por distância em linha reta (ADR-0044): o texto diz que a ordem é a de chegada e oferece o botão.
 * Uma parada só não tem ordem a explicar, então nada é desenhado.
 */
export function TripStopOrderNotice({
  canOrder,
  errorCode,
  isOrdering,
  onOrder,
  source,
  stopCount,
}: TripStopOrderNoticeProps) {
  const { t } = useTranslation('trip')
  if (stopCount < 2) return null
  const resolvedSource = source ?? STOP_ORDER_SOURCE.unordered

  return (
    <div className={styles.stopOrderRow}>
      <p
        className={errorCode === null || errorCode === undefined ? styles.hint : styles.alert}
        role={errorCode === null || errorCode === undefined ? undefined : 'status'}
      >
        {errorCode === null || errorCode === undefined
          ? t(`stopOrder.source.${resolvedSource}`)
          : t(`stopOrder.error.${errorCode}`)}
      </p>
      {canOrder ? (
        <Button disabled={isOrdering} onClick={onOrder} size="sm" type="button" variant="secondary">
          <Icon name="sort" />
          {t(isOrdering ? 'stopOrder.ordering' : 'stopOrder.action')}
        </Button>
      ) : null}
    </div>
  )
}
