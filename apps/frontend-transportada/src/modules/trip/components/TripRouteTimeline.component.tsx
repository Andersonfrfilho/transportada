/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'
import {
  formatDistance,
  formatDuration,
} from '@/modules/routing/shared/suggestionValuation.service'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { BuildRouteTimelineInput, RouteTimelineEvent } from '../shared/routeTimeline.service'
import { buildRouteTimeline } from '../shared/routeTimeline.service'
import styles from '../styles/trip.module.css'

type TripRouteTimelineProps = Readonly<{
  input: BuildRouteTimelineInput
  /**
   * ⚠️ **Ausente = sem botão**, o mesmo padrão de `onStopRemove` no mapa: quem hospeda a linha do
   * tempo nem sempre é dono do roteiro. Na viagem já criada tirar parada é outra operação.
   */
  onRemoveStop?: ((nfeDocumentIds: readonly string[]) => void) | undefined
  onUndoRemoveStop?: ((nfeDocumentIds: readonly string[]) => void) | undefined
}>

/**
 * Spec 110 D4: **o dia em ordem** — base, entregas e as praças de pedágio no trecho de cada uma.
 *
 * ⚠️ A praça é desenhada na **perna**, entre a distância e a parada seguinte: pendurá-la na parada
 * diria que ela é da entrega, e a mesma praça serve duas entregas quando a perna é a mesma.
 */
export function TripRouteTimeline({
  input,
  onRemoveStop,
  onUndoRemoveStop,
}: TripRouteTimelineProps) {
  const events = buildRouteTimeline(input)

  if (events.length === 0) return null

  return (
    <ol className={styles.timeline}>
      {events.map((event, index) => (
        <TimelineRow
          event={event}
          key={`${event.of}-${String(index)}`}
          onRemoveStop={onRemoveStop}
          onUndoRemoveStop={onUndoRemoveStop}
        />
      ))}
    </ol>
  )
}

function TimelineRow({
  event,
  onRemoveStop,
  onUndoRemoveStop,
}: Readonly<{
  event: RouteTimelineEvent
  onRemoveStop?: ((nfeDocumentIds: readonly string[]) => void) | undefined
  onUndoRemoveStop?: ((nfeDocumentIds: readonly string[]) => void) | undefined
}>) {
  const { t } = useTranslation('trip')

  if (event.of === 'origin' || event.of === 'end') {
    return (
      <li className={styles.timelineRow}>
        <span className={styles.timelineRail}>
          <span className={styles.timelineBase} />
        </span>
        <span className={styles.timelineBody}>
          <strong>{event.label}</strong>
        </span>
      </li>
    )
  }

  if (event.of === 'leg') {
    const distance = formatDistance(event.distanceMeters)
    const duration = formatDuration(event.durationSeconds)

    return (
      <li className={styles.timelineRow}>
        <span className={styles.timelineRail} />
        <span className={`${styles.timelineBody} ${styles.timelineMeta}`}>
          {/* Ausência é dita, nunca desenhada como zero: perna sem distância conhecida. */}
          {distance === null ? t('timeline.legUnknown') : distance}
          {duration === null ? '' : ` · ${duration}`}
          {event.isReturn ? ` · ${t('timeline.return')}` : ''}
        </span>
      </li>
    )
  }

  if (event.of === 'booth') {
    return (
      <li className={styles.timelineRow}>
        <span className={styles.timelineRail}>
          <span
            className={event.amount === null ? styles.timelineTollUnknown : styles.timelineToll}
          >
            P
          </span>
        </span>
        <span className={`${styles.timelineBody} ${styles.timelineBooth}`}>
          <span>
            {event.name}
            {event.operator === null ? (
              ''
            ) : (
              <span className={styles.timelineMeta}> · {event.operator}</span>
            )}
          </span>
          <span className={event.amount === null ? styles.timelineGap : undefined}>
            {event.amount === null ? t('timeline.tollUnknown') : formatAmount(event.amount)}
          </span>
        </span>
      </li>
    )
  }

  if (event.of === 'stop') {
    const documentIds = event.nfeDocumentIds

    return (
      <li className={styles.timelineRow}>
        <span className={styles.timelineRail}>
          <span className={styles.timelineDot}>{event.sequence}</span>
        </span>
        <span className={styles.timelineBody}>
          <span className={event.removed ? styles.timelineRemoved : undefined}>
            {event.label}
            <span className={styles.timelineMeta}>
              {' · '}
              {event.removed
                ? t('proposal.removedStop', { count: event.documentCount })
                : t('timeline.notes', { count: event.documentCount })}
            </span>
            {/* ADR-0044 §5: centroide de município é palpite de quilômetros, e vai marcado. */}
            {event.approximate && !event.removed ? (
              <span className={styles.timelineApproximate}>{t('timeline.approximate')}</span>
            ) : null}
          </span>
          {/* Ação em menu, nunca edição em linha — a mesma regra do desvio de endereço (D9 da 056). */}
          {event.removed && onUndoRemoveStop !== undefined ? (
            <Button
              onClick={() => onUndoRemoveStop(documentIds)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {/* web.md §9: toda ação da viagem leva ícone — desfazer é a volta ao estado anterior. */}
              <Icon name="refresh" />
              {t('proposal.undoRemoveStop')}
            </Button>
          ) : null}
          {!event.removed && onRemoveStop !== undefined ? (
            <Tooltip label={t('proposal.removeStop', { label: event.label })}>
              <Button
                aria-label={t('proposal.removeStop', { label: event.label })}
                onClick={() => onRemoveStop(documentIds)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="trash" />
              </Button>
            </Tooltip>
          ) : null}
        </span>
      </li>
    )
  }

  if (event.of === 'openEnd') {
    return (
      <li className={styles.timelineRow}>
        <span className={styles.timelineRail}>
          <span className={styles.timelineOpenEnd} />
        </span>
        <span className={`${styles.timelineBody} ${styles.timelineMeta}`}>
          {t('timeline.openEnd')}
        </span>
      </li>
    )
  }

  return (
    <li className={`${styles.timelineRow} ${styles.timelinePayment}`}>
      <span className={styles.timelineRail}>
        <span className={styles.timelinePaymentMark}>R$</span>
      </span>
      <span className={`${styles.timelineBody} ${styles.timelineBooth}`}>
        <span>
          {t('timeline.driverPayment')}
          <span className={styles.timelineMeta}>
            {' · '}
            {t(`timeline.driverZone.${event.paymentModel}`, {
              city: event.regionCity ?? '',
              defaultValue: event.vehicleClass,
              vehicleClass: event.vehicleClass,
              zone: event.regionCode ?? '',
            })}
          </span>
        </span>
        <span>{event.amount === null ? '' : formatAmount(event.amount)}</span>
      </span>
    </li>
  )
}
