/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { ScalePlan, type ScalePlanBox } from '@/components/ui/scale-plan'

import { stopColorOf } from '../shared/stopColor.service'
import type { TripCargoLayout } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripCargoLayersProps = Readonly<{ layout: TripCargoLayout | null }>

/**
 * Spec 094: **onde cada caixa cabe**, camada por camada.
 *
 * ⚠️ A promessa é **"cabe"**, nunca "deve ir assim" — e a tela diz isso numa linha fixa. Faltam
 * empilhabilidade informada em toda caixa, peso por caixa e peso por eixo; sem eles o desenho mostra
 * um arranjo possível, não uma instrução de carregamento. Um plano de estiva que não conhece o peso
 * por eixo é o defeito que a 085 evitou, com outra roupa.
 *
 * ⚠️ Uma camada por vez, com navegação. Todas de uma vez seriam seis plantas empilhadas na tela do
 * celular de quem está no galpão — e o carregamento é feito uma camada por vez, que é a razão de o
 * desenho ser assim.
 */
export function TripCargoLayers({ layout }: TripCargoLayersProps) {
  const { t } = useTranslation('trip')
  const [index, setIndex] = useState(0)

  const placement = layout?.placement ?? null
  if (layout === null || placement === null || placement.layers.length === 0) return null
  if (layout.bedLengthM === null || layout.bedWidthM === null) return null

  const current = placement.layers[Math.min(index, placement.layers.length - 1)]
  if (current === undefined) return null

  const boxes: readonly ScalePlanBox[] = current.boxes.map((box, position) => ({
    color: stopColorOf(box.stopSequence),
    depthM: box.depthM,
    id: `${String(current.index)}-${String(position)}`,
    isEstimated: box.source === 'estimated',
    label: '',
    widthM: box.widthM,
    xM: box.xM,
    yM: box.yM,
  }))

  return (
    <section aria-labelledby="trip-cargo-layers-title" className={styles.panel}>
      <h3 className={styles.hint} id="trip-cargo-layers-title">
        {t('cargoLayers.title')}
      </h3>

      {/* ⚠️ A linha que diz o que a planta NÃO promete. Fixa, nunca condicional. */}
      <p className={styles.hint}>{t('cargoLayers.promise')}</p>

      <div className={styles.cargoLayerNav}>
        <Button
          disabled={index === 0}
          type="button"
          variant="ghost"
          onClick={() => setIndex((previous) => Math.max(0, previous - 1))}
        >
          <Icon name="chevron-left" />
          {t('cargoLayers.previous')}
        </Button>
        <span>
          {t('cargoLayers.position', {
            index: current.index + 1,
            total: placement.layers.length,
          })}
        </span>
        <Button
          disabled={index >= placement.layers.length - 1}
          type="button"
          variant="ghost"
          onClick={() =>
            setIndex((previous) => Math.min(placement.layers.length - 1, previous + 1))
          }
        >
          {t('cargoLayers.next')}
          <Icon name="chevron-right" />
        </Button>
      </div>

      <ScalePlan
        ariaLabel={t('cargoLayers.planLabel', { index: current.index + 1 })}
        bands={[]}
        boxes={boxes}
        doorLabel={t('cargoPlan.door')}
        {...(layout.loadingAccess === 'rear' ? {} : { sideDoorLabel: t('cargoLayers.sideDoor') })}
        lengthM={Number.parseFloat(layout.bedLengthM)}
        widthM={Number.parseFloat(layout.bedWidthM)}
      />

      {/* O corte lateral: a planta diz onde a caixa fica, e ele diz como a pilha sobe. */}
      <TripCargoSideView layers={placement.layers} selected={current.index} />

      {placement.source === 'estimated' ? (
        <p className={styles.hint}>{t('cargoLayers.estimated')}</p>
      ) : null}

      {placement.unplaced.length === 0 ? null : (
        <ul className={styles.cargoUnplaced} role="list">
          {placement.unplaced.map((entry) => (
            <li key={`${entry.label}-${entry.reason}`}>
              {t(`cargoLayers.unplaced.${entry.reason}`, {
                count: entry.count,
                label: entry.label,
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * O baú de lado, com as camadas empilhadas e a atual destacada. É a segunda metade do par que
 * substitui o 3D: a planta diz **onde**, o corte diz **quão alto** — e as duas se conferem com fita,
 * o que uma projeção isométrica não permite.
 */
function TripCargoSideView({
  layers,
  selected,
}: Readonly<{
  layers: TripCargoLayout['placement'] extends null
    ? never
    : readonly { heightM: number; index: number }[]
  selected: number
}>) {
  const { t } = useTranslation('trip')
  const total = layers.reduce((sum, layer) => sum + layer.heightM, 0)
  if (total <= 0) return null

  return (
    <div aria-hidden="true" className={styles.cargoSideView}>
      {[...layers].reverse().map((layer) => (
        <div
          className={layer.index === selected ? styles.cargoSideLayerActive : styles.cargoSideLayer}
          key={layer.index}
          style={{ height: `${String((layer.heightM / total) * 100)}%` }}
        >
          {t('cargoLayers.sideLayer', { index: layer.index + 1 })}
        </div>
      ))}
    </div>
  )
}
