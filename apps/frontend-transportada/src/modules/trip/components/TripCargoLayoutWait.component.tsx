/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { CargoIsometric, type IsometricBox } from '@/components/ui/cargo-isometric'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { useCargoLayoutElapsed } from '../hooks/useCargoLayoutElapsed.hook'
import {
  formatCargoLayoutElapsed,
  isCargoLayoutWaitLong,
} from '../shared/cargoLayoutElapsed.service'
import type { CargoLayoutView } from '../shared/cargoLayoutPolling.service'
import { flattenPlacedBoxes } from '../shared/cargoLayoutTransition.service'
import { noteColorOf, resolveNoteColors } from '../shared/noteColor.service'
import { stopColorOf } from '../shared/stopColor.service'
import type { TripCargoLayout, TripOccupancy } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripCargoLayoutWaitProps = Readonly<{
  bedDimensions: TripOccupancy['capacityDimensions']
  view: CargoLayoutView
}>

type WaitBed = Readonly<{ heightM: number; lengthM: number; widthM: number }>

/** Sem medida nenhuma, o esqueleto tem a altura aproximada do desenho que ele antecipa. */
const DRAWING_SKELETON_HEIGHT = '12rem'

/**
 * Spec 145 T13 (D4, D16, D18): a planta enquanto o worker calcula, e quando ele não conseguiu.
 *
 * ⚠️ **Sem botão de tentar de novo** em `failed`/`timedOut`: a próxima leitura depois da espera da
 * D18 reabre o pedido sozinha, e um botão aqui só apressaria o laço que a D18 existe para impedir.
 */
export function TripCargoLayoutWait({ bedDimensions, view }: TripCargoLayoutWaitProps) {
  const { t } = useTranslation('trip')
  const ghost = resolveGhostLayout(view.layout)
  const isPending = view.phase === 'pending'
  const isStale = ghost !== null && (view.stale || !isPending)
  const elapsedMs = useCargoLayoutElapsed({ since: isPending ? view.pendingSince : undefined })
  const isLong = elapsedMs !== undefined && isCargoLayoutWaitLong(elapsedMs)

  return (
    <section aria-labelledby="trip-cargo-layers-title" className={styles.panel}>
      <h3 className={styles.hint} id="trip-cargo-layers-title">
        {t('cargoLayers.title')}
      </h3>
      {/* O selo diz em texto o que o giro do ícone sugere: nada fica só na cor ou no movimento. */}
      <div className={styles.cargoWaitStatus}>
        <div aria-live="polite" className={styles.cargoWaitStatus} role="status">
          <p className={isPending ? styles.cargoWaitBadge : styles.warning}>
            <Icon aria-hidden name={isPending ? 'spinner' : 'alert'} />
            {isPending ? t('cargoLayers.wait.reorganizing') : t('cargoLayers.wait.failed')}
          </p>
          {isLong ? <p className={styles.hint}>{t('cargoLayers.wait.slow')}</p> : null}
        </div>
        {elapsedMs === undefined ? null : (
          <p aria-live="off" className={styles.cargoWaitElapsed}>
            {t('cargoLayers.wait.elapsed', { elapsed: formatCargoLayoutElapsed(elapsedMs) })}
          </p>
        )}
      </div>
      {isStale ? <p className={styles.hint}>{t('cargoLayers.wait.stale')}</p> : null}
      <TripCargoWaitDrawing
        bed={resolveWaitBed(ghost, bedDimensions)}
        ghost={ghost}
        isPending={isPending}
      />
    </section>
  )
}

/**
 * O baú no mesmo sistema de escala da planta, sem carga (esqueleto) ou com a anterior translúcida
 * (fantasma). Na falha sem planta anterior não há o que desenhar: a mensagem basta.
 */
function TripCargoWaitDrawing({
  bed,
  ghost,
  isPending,
}: Readonly<{ bed: WaitBed | null; ghost: TripCargoLayout | null; isPending: boolean }>) {
  const { t } = useTranslation('trip')
  if (ghost === null && !isPending) return null
  if (bed === null) return <Skeleton height={DRAWING_SKELETON_HEIGHT} variant="block" />

  return (
    <div className={cn(styles.cargoStage, isPending && styles.cargoWireframe)}>
      <CargoIsometric
        ariaLabel={
          ghost === null ? t('cargoLayers.wait.skeletonLabel') : t('cargoLayers.wait.ghostLabel')
        }
        bedHeightM={bed.heightM}
        bedLengthM={bed.lengthM}
        bedWidthM={bed.widthM}
        boxes={ghost === null ? [] : toGhostBoxes(ghost)}
        className={ghost === null ? undefined : styles.cargoGhost}
        hasSideDoor={ghost !== null && ghost.loadingAccess !== 'rear'}
      />
    </div>
  )
}

/** Só vira fantasma a planta que tem baú medido e arranjo — a mesma regra da planta pronta. */
function resolveGhostLayout(layout: TripCargoLayout | null): TripCargoLayout | null {
  if (layout === null || layout.placement === null) return null
  if (layout.bedLengthM === null || layout.bedWidthM === null) return null
  return layout
}

function resolveWaitBed(
  ghost: TripCargoLayout | null,
  bedDimensions: TripOccupancy['capacityDimensions'],
): WaitBed | null {
  if (ghost !== null && ghost.bedLengthM !== null && ghost.bedWidthM !== null) {
    const cargoTopM = Math.max(0, ...flattenPlacedBoxes(ghost).map((box) => box.zM + box.heightM))
    const bedHeightM = Number.parseFloat(ghost.bedHeightM ?? '0')
    return {
      heightM: bedHeightM > 0 ? bedHeightM : cargoTopM,
      lengthM: Number.parseFloat(ghost.bedLengthM),
      widthM: Number.parseFloat(ghost.bedWidthM),
    }
  }
  if (bedDimensions === null) return null
  return {
    heightM: Number.parseFloat(bedDimensions.heightM),
    lengthM: Number.parseFloat(bedDimensions.lengthM),
    widthM: Number.parseFloat(bedDimensions.widthM),
  }
}

/** A planta anterior com as cores de nota que ela tinha na tela — sem clique, sem marca. */
function toGhostBoxes(layout: TripCargoLayout): readonly IsometricBox[] {
  const placed = flattenPlacedBoxes(layout)
  const noteColors = resolveNoteColors(placed)
  return placed.map((box, index) => ({
    color: noteColorOf(noteColors, box, stopColorOf(box.stopSequence)),
    complement: null,
    depthM: box.depthM,
    heightM: box.heightM,
    id: String(index),
    isEstimated: box.source === 'estimated',
    isGhost: false,
    isSplit: false,
    layer: box.layer,
    stopSequence: box.stopSequence,
    widthM: box.widthM,
    xM: box.xM,
    yM: box.yM,
    zM: box.zM,
  }))
}
