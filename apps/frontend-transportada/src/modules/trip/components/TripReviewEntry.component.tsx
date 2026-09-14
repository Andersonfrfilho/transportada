/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useRevealedPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useTripMoveTargets, useTripSwapSuggestions } from '../hooks/useTripReviewQueue.hook'
import type { TripDocumentReview, TripReviewChange } from '../shared/tripReview.types'
import { formatDeltaPercent } from '../shared/tripReviewQueue.service'
import styles from '../styles/trip.module.css'

/** A troca mostra as mais parecidas primeiro; mais que isto é lista que ninguém compara. */
const SUGGESTION_LIMIT = 5

export type ReviewVehicle = Readonly<{ id: string; plate: string }>

type ReviewChangeControl = Readonly<{
  errorKey: null | string
  isPending: boolean
  run: (change: TripReviewChange) => void
}>

type TripReviewEntryProps = Readonly<{
  canAct: boolean
  change: ReviewChangeControl
  review: TripDocumentReview
  vehicles: readonly ReviewVehicle[]
}>

/**
 * Uma nota da fila, com as duas saídas (D7): "Trocar por outra nota" — a que sai volta para a mesma
 * fila — e "Mover para outro caminhão", com a carga conferida no destino antes de gravar.
 */
export function TripReviewEntry({ canAct, change, review, vehicles }: TripReviewEntryProps) {
  const { t } = useTranslation('trip')
  const [panel, setPanel] = useState<'move' | 'swap' | null>(null)
  const note =
    review.nfeNumber === null
      ? t('reviewQueue.noteWithoutNumber')
      : t('reviewQueue.note', { number: review.nfeNumber })

  function handleToggle(next: 'move' | 'swap'): void {
    setPanel((current) => (current === next ? null : next))
  }

  return (
    <li>
      <span>
        {t('reviewQueue.row', { note, reason: t(`reviewQueue.reason.${review.reason}`) })}
      </span>
      {canAct ? (
        <span className={styles.cargoNotes}>
          <Button
            disabled={change.isPending}
            onClick={() => handleToggle('swap')}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="refresh" />
            {t('reviewQueue.swap')}
          </Button>
          <Button
            disabled={change.isPending}
            onClick={() => handleToggle('move')}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="truck" />
            {t('reviewQueue.move')}
          </Button>
        </span>
      ) : null}
      {canAct && panel === 'swap' ? (
        <SwapPanel
          disabled={change.isPending}
          onSwap={(outTripDocumentId) => change.run({ kind: 'swap', outTripDocumentId })}
          reviewId={review.id}
        />
      ) : null}
      {canAct && panel === 'move' ? (
        <MovePanel
          disabled={change.isPending}
          onMove={(targetTripId) => change.run({ kind: 'move', targetTripId })}
          sourceTripId={review.sourceTripId}
          vehicles={vehicles}
        />
      ) : null}
      {change.isPending ? (
        <p className={styles.hint} role="status">
          {t('reviewQueue.checking')}
        </p>
      ) : null}
      {change.errorKey === null ? null : (
        <p className={styles.hint} role="alert">
          {t(change.errorKey)}
        </p>
      )}
    </li>
  )
}

/** D10: cada nota do caminhão que poderia sair, com o efeito em porcentagem de peso e de espaço. */
function SwapPanel({
  disabled,
  onSwap,
  reviewId,
}: Readonly<{ disabled: boolean; onSwap: (tripDocumentId: string) => void; reviewId: string }>) {
  const { t } = useTranslation('trip')
  const { panelRef } = useRevealedPanel<HTMLDivElement>()
  const suggestions = useTripSwapSuggestions({ enabled: true, reviewId })
  const items = (suggestions.data?.suggestions ?? []).slice(0, SUGGESTION_LIMIT)
  const unknown = t('reviewQueue.unknown')

  return (
    <div className={styles.cargoNotes} ref={panelRef}>
      <p className={styles.hint}>{t('reviewQueue.swapTitle')}</p>
      {suggestions.isPending ? (
        <SkeletonGroup label={t('reviewQueue.loading')}>
          <Skeleton variant="text" width="60%" />
        </SkeletonGroup>
      ) : null}
      {suggestions.isSuccess && items.length === 0 ? (
        <p className={styles.hint}>{t('reviewQueue.suggestionsEmpty')}</p>
      ) : null}
      <ul className={styles.cargoUnplaced} role="list">
        {items.map((suggestion) => (
          <li key={suggestion.tripDocumentId}>
            <span>
              {suggestion.nfeNumber === null
                ? t('reviewQueue.noteWithoutNumber')
                : t('reviewQueue.note', { number: suggestion.nfeNumber })}{' '}
              ·{' '}
              {t('reviewQueue.delta', {
                space: formatDeltaPercent(suggestion.volumeDeltaPercent) ?? unknown,
                weight: formatDeltaPercent(suggestion.weightDeltaPercent) ?? unknown,
              })}
            </span>
            <Button
              disabled={disabled}
              onClick={() => onSwap(suggestion.tripDocumentId)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="check" />
              {t('reviewQueue.swapConfirm')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Outro caminhão ainda aberto; a planta do destino confere a carga antes de gravar. */
function MovePanel({
  disabled,
  onMove,
  sourceTripId,
  vehicles,
}: Readonly<{
  disabled: boolean
  onMove: (targetTripId: string) => void
  sourceTripId: string
  vehicles: readonly ReviewVehicle[]
}>) {
  const { t } = useTranslation('trip')
  const { panelRef } = useRevealedPanel<HTMLDivElement>()
  const targets = useTripMoveTargets({ enabled: true, sourceTripId })
  const [targetTripId, setTargetTripId] = useState('')
  const options = (targets.data ?? []).map((trip) => ({
    label: t('reviewQueue.moveTargetLabel', {
      drivers:
        trip.driverNames.length === 0
          ? t('reviewQueue.moveTargetNoDriver')
          : trip.driverNames.join(', '),
      vehicle:
        vehicles.find((vehicle) => vehicle.id === trip.vehicleId)?.plate ??
        t('reviewQueue.moveTargetUnknownVehicle'),
    }),
    value: trip.id,
  }))

  return (
    <div className={styles.cargoNotes} ref={panelRef}>
      {targets.isPending ? (
        <SkeletonGroup label={t('reviewQueue.loading')}>
          <Skeleton variant="text" width="60%" />
        </SkeletonGroup>
      ) : null}
      {targets.isSuccess && options.length === 0 ? (
        <p className={styles.hint}>{t('reviewQueue.moveTargetsEmpty')}</p>
      ) : (
        <Select
          ariaLabel={t('reviewQueue.moveTarget')}
          onChange={setTargetTripId}
          options={options}
          placeholder={t('reviewQueue.moveTarget')}
          value={targetTripId}
        />
      )}
      <Button
        disabled={disabled || targetTripId === ''}
        onClick={() => onMove(targetTripId)}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Icon name="check" />
        {t('reviewQueue.moveConfirm')}
      </Button>
    </div>
  )
}
