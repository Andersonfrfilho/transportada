/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { CargoIsometric, type IsometricBox } from '@/components/ui/cargo-isometric'

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

  /**
   * ⚠️ **Todas as camadas no desenho**, com a escolhida em foco e as outras esmaecidas. Desenhar só a
   * camada aberta tiraria justamente o que o 3D tem de melhor — ver a pilha inteira — e deixaria a
   * carga flutuando sobre um piso vazio.
   */
  const zByLayer = new Map<number, number>()
  let stacked = 0
  for (const layer of placement.layers) {
    zByLayer.set(layer.index, stacked)
    stacked += layer.heightM
  }

  const boxes: readonly IsometricBox[] = placement.layers.flatMap((layer) =>
    layer.boxes.map((box, position) => ({
      color: stopColorOf(box.stopSequence),
      depthM: box.depthM,
      heightM: box.heightM,
      id: `${String(layer.index)}-${String(position)}`,
      isEstimated: box.source === 'estimated',
      isSplit: box.reasons.includes('splitCargo'),
      widthM: box.widthM,
      xM: box.xM,
      yM: box.yM,
      zM: zByLayer.get(layer.index) ?? 0,
    })),
  )

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

      <CargoIsometric
        ariaLabel={t('cargoLayers.planLabel', { index: current.index + 1 })}
        bedHeightM={stacked}
        bedLengthM={Number.parseFloat(layout.bedLengthM)}
        bedWidthM={Number.parseFloat(layout.bedWidthM)}
        boxes={boxes}
        focusLayerZM={zByLayer.get(current.index) ?? 0}
        hasSideDoor={layout.loadingAccess !== 'rear'}
      />

      {/* A legenda das aberturas em texto: rótulo dentro do desenho sai cortado e atravessa a borda. */}
      <p className={styles.hint}>
        {layout.loadingAccess === 'rear'
          ? t('cargoLayers.doorsRear')
          : t('cargoLayers.doorsRearAndSide')}
      </p>

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
