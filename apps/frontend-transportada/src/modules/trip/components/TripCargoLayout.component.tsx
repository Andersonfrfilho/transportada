/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { TripCargoLayout, TripOccupancy } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripCargoLayoutProps = {
  layout: TripCargoLayout | null
  occupancy: TripOccupancy | null
}

/** Seis tons distinguíveis; acima disso a tela agrupa em vez de inventar cor que ninguém separa. */
const STOP_COLORS = 6

const volumeFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

function formatVolume(value: string): string {
  return volumeFormatter.format(Number.parseFloat(value))
}

function colorOf(index: number): string {
  return `var(--color-cargo-stop-${(index % STOP_COLORS) + 1})`
}

/**
 * Spec 076: o baú em escala, fatiado por parada.
 *
 * ⚠️ **É representação proporcional, não plano de estiva.** A NF-e não traz dimensão de volume — a
 * cubagem é estimada e é um total por nota, não a caixa —, então **não existe como dizer onde cada
 * caixa vai**. A diferença entre "esta fatia do baú é da parada 3" e "esta caixa vai neste canto" é
 * a diferença entre ajudar e enganar, e é por isso que o desenho não sugere posição de peça.
 *
 * Sem capacidade conhecida não se desenha nada (D3): um retângulo genérico "só para ilustrar" seria
 * afirmação falsa sobre espaço.
 */
export function TripCargoLayoutPanel({ layout, occupancy }: TripCargoLayoutProps) {
  const { t } = useTranslation('trip')
  if (layout === null) return null

  const isEstimated = occupancy?.source === 'estimated'

  return (
    <section aria-labelledby="trip-cargo-layout-title" className={styles.panel}>
      <h3 className={styles.hint} id="trip-cargo-layout-title">
        {t('cargoLayout.title')}
      </h3>
      <p className={styles.hint}>{t('cargoLayout.loadOrderHint')}</p>

      {/* O desenho é decorativo: a mesma informação sai na lista abaixo, para leitor de tela e impressão. */}
      <div aria-hidden="true" className={styles.cargoBox}>
        {layout.slices.map((slice, index) => (
          <div
            className={styles.cargoSlice}
            key={slice.sequence}
            style={{
              backgroundColor: colorOf(index),
              flexGrow: Number.parseFloat(slice.share),
            }}
          />
        ))}
        <div className={styles.cargoFree} style={{ flexGrow: freeShare(layout) }} />
      </div>

      <ul className={styles.cargoLegend} role="list">
        {layout.slices.map((slice, index) => (
          <li key={slice.sequence}>
            <span
              aria-hidden="true"
              className={styles.cargoSwatch}
              style={{ backgroundColor: colorOf(index) }}
            />
            {t('cargoLayout.slice', {
              label: slice.label,
              order: slice.loadOrder,
              volume: formatVolume(slice.volumeM3),
            })}
          </li>
        ))}
      </ul>

      {Number.parseFloat(layout.overflowM3) > 0 ? (
        <p className={styles.cargoOverflow} role="status">
          {t('cargoLayout.overflow', { volume: formatVolume(layout.overflowM3) })}
        </p>
      ) : null}

      {layout.stopsWithoutVolume.length > 0 ? (
        <p className={styles.hint}>
          {t('cargoLayout.withoutVolume', {
            stops: layout.stopsWithoutVolume.map((stop) => stop.label).join(', '),
          })}
        </p>
      ) : null}

      {isEstimated ? <p className={styles.hint}>{t('cargoLayout.estimated')}</p> : null}
    </section>
  )
}

/** O espaço livre é o resto — e ele nunca é negativo: o excedente é dito fora, não comprimido. */
function freeShare(layout: TripCargoLayout): number {
  const used = layout.slices.reduce((total, slice) => total + Number.parseFloat(slice.share), 0)
  return Math.max(0, 1 - used)
}
