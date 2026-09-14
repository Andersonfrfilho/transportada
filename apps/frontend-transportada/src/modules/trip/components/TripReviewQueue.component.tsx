/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useTripReviewQueue } from '../hooks/useTripReviewQueue.hook'
import type { TripCargoPlacement } from '../shared/trip.types'
import type { TripReviewKeptNote } from '../shared/tripReview.types'
import {
  resolveReviewErrorKey,
  summarizeUnplacedNotes,
  type ReleasableNote,
} from '../shared/tripReviewQueue.service'
import { TripReviewEntry, type ReviewVehicle } from './TripReviewEntry.component'
import styles from '../styles/trip.module.css'

type ReviewTarget =
  | Readonly<{ kind: 'trip'; tripId: string; vehicles: readonly ReviewVehicle[] }>
  /** Na proposta a viagem ainda não existe: o botão marca, e o aceite solta (D10). */
  | Readonly<{ isMarked: boolean; kind: 'proposal'; onToggle: () => void }>

type TripReviewQueueProps = Readonly<{
  canManage: boolean
  isEditable: boolean
  /** A planta pronta do hash atual; sem ela não há de onde soltar. */
  layoutId: null | string
  target: ReviewTarget
  unplaced: TripCargoPlacement['unplaced']
}>

/**
 * Spec 148 T7 (D7, D10–D13): "Notas fora do caminhão (N)". A nota que não coube sai por botão —
 * nunca sozinha —, e cada uma pede um destino: trocar por outra nota do caminhão ou mover para outro.
 * Tudo só com `trip.manage` e viagem não despachada: a trava é o despacho, o CT-e não trava.
 */
export function TripReviewQueue(props: TripReviewQueueProps) {
  return props.target.kind === 'proposal' ? (
    <ProposalReviewQueue {...props} target={props.target} />
  ) : (
    <TripDocumentReviewQueue {...props} target={props.target} />
  )
}

function ProposalReviewQueue({
  canManage,
  isEditable,
  layoutId,
  target,
  unplaced,
}: TripReviewQueueProps & { target: Extract<ReviewTarget, { kind: 'proposal' }> }) {
  const { t } = useTranslation('trip')
  const { kept, releasable } = summarizeUnplacedNotes(unplaced)
  if (releasable.length === 0 && kept.length === 0) return null
  const count = releasable.length

  return (
    <section aria-labelledby="trip-review-queue-title" className={styles.cargoNotes}>
      <h4 className={styles.hint} id="trip-review-queue-title">
        {t('reviewQueue.title', { count })}
      </h4>
      <LeftOutNotes notes={releasable} unplaced={unplaced} />
      <KeptNotes kept={kept} />
      {canManage && isEditable && layoutId !== null && count > 0 ? (
        <div className={styles.cargoNotes}>
          <Button onClick={target.onToggle} size="sm" type="button" variant="secondary">
            <Icon name={target.isMarked ? 'refresh' : 'truck'} />
            {target.isMarked
              ? t('reviewQueue.keep', { count })
              : t('reviewQueue.release', { count })}
          </Button>
          {target.isMarked ? (
            <p className={styles.hint} role="status">
              {t('reviewQueue.marked')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function TripDocumentReviewQueue({
  canManage,
  isEditable,
  layoutId,
  target,
  unplaced,
}: TripReviewQueueProps & { target: Extract<ReviewTarget, { kind: 'trip' }> }) {
  const { t } = useTranslation('trip')
  const queue = useTripReviewQueue({ enabled: true, tripId: target.tripId })
  const { kept, releasable } = summarizeUnplacedNotes(unplaced)
  const reviews = queue.reviewsQuery.data ?? []
  const canAct = canManage && isEditable
  const changing = queue.changeMutation.variables?.reviewId

  if (queue.reviewsQuery.isPending) {
    return (
      <SkeletonGroup label={t('reviewQueue.loading')}>
        <Skeleton variant="text" width="60%" />
      </SkeletonGroup>
    )
  }
  if (reviews.length === 0 && releasable.length === 0 && kept.length === 0) return null

  return (
    <section aria-labelledby="trip-review-queue-title" className={styles.cargoNotes}>
      <h4 className={styles.hint} id="trip-review-queue-title">
        {t('reviewQueue.title', { count: reviews.length + releasable.length })}
      </h4>
      {reviews.length === 0 ? null : (
        <ul className={styles.cargoUnplaced} role="list">
          {reviews.map((review) => (
            <TripReviewEntry
              canAct={canAct}
              change={{
                errorKey:
                  changing === review.id && queue.changeMutation.isError
                    ? resolveReviewErrorKey(queue.changeMutation.error)
                    : null,
                isPending: changing === review.id && queue.changeMutation.isPending,
                run: (change) =>
                  queue.changeMutation.mutate({
                    change,
                    nfeDocumentId: review.nfeDocumentId,
                    reviewId: review.id,
                  }),
              }}
              key={review.id}
              review={review}
              vehicles={target.vehicles}
            />
          ))}
        </ul>
      )}
      <LeftOutNotes notes={releasable} unplaced={unplaced} />
      <KeptNotes kept={kept} />
      {canAct && layoutId !== null && releasable.length > 0 ? (
        <Button
          disabled={queue.releaseMutation.isPending}
          onClick={() => queue.releaseMutation.mutate(layoutId)}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Icon name="truck" />
          {t('reviewQueue.release', { count: releasable.length })}
        </Button>
      ) : null}
      {queue.releaseMutation.isError ? (
        <p className={styles.hint} role="alert">
          {t(resolveReviewErrorKey(queue.releaseMutation.error))}
        </p>
      ) : null}
    </section>
  )
}

/** As notas que a planta deixou de fora e ainda estão na viagem, com o motivo de cada uma. */
function LeftOutNotes({
  notes,
  unplaced,
}: Readonly<{ notes: readonly ReleasableNote[]; unplaced: TripCargoPlacement['unplaced'] }>) {
  const { t } = useTranslation('trip')
  if (notes.length === 0) return null

  return (
    <ul className={styles.cargoUnplaced} role="list">
      {notes.map((note) => (
        <li key={note.documentId}>
          {t('reviewQueue.leftOutRow', {
            count: note.boxCount,
            label: unplaced.find((line) => line.documentId === note.documentId)?.label ?? '',
            reason: t(`reviewQueue.reason.${note.reason}`),
          })}
        </li>
      ))}
    </ul>
  )
}

/** D11 e o corte por prazo: a nota fica no caminhão, e o aviso diz o que falta. */
function KeptNotes({ kept }: Readonly<{ kept: readonly TripReviewKeptNote[] }>) {
  const { t } = useTranslation('trip')
  const notMeasured = kept.filter((note) => note.reason === 'notMeasured').length
  const timeBudget = kept.length - notMeasured

  return (
    <>
      {notMeasured === 0 ? null : (
        <p className={styles.hint}>{t('reviewQueue.keptNotMeasured', { count: notMeasured })}</p>
      )}
      {timeBudget === 0 ? null : (
        <p className={styles.hint}>{t('reviewQueue.keptTimeBudget', { count: timeBudget })}</p>
      )}
    </>
  )
}
