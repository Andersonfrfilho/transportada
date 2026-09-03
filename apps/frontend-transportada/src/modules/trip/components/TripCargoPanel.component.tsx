/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { TripCargoLayout, TripCargoWeight, TripOccupancy } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripCargoPanelProps = {
  cargoWeight: TripCargoWeight | null
  layout: TripCargoLayout | null
  occupancy: TripOccupancy | null
}

const PERCENT_SCALE = 100

/** Seis tons distinguíveis; acima disso a tela agrupa em vez de inventar cor que ninguém separa. */
const STOP_COLORS = 6

/**
 * Duas casas, vírgula decimal e separador de milhar — a escala do banco é seis, e imprimir
 * `2.250000 m³` faz o operador ler a precisão como exatidão que o número não tem: ele é estimado.
 */
const volumeFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

/** Medida de baú tem centímetro: duas casas bastam, e `3,20 × 1,65 × 1,90 m` é como se lê na fita. */
const lengthFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

const weightFormatter = new Intl.NumberFormat('pt-BR', {
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
 * A carga da viagem **num painel só**: quanto do baú foi ocupado, quanto pesa e como ela se
 * distribui pelas paradas. Eram dois blocos que diziam metade cada um — a ocupação sem saber de
 * quem era o espaço, e o desenho sem o número que ele ilustra —, e a marca de estimativa aparecia
 * duas vezes.
 *
 * ⚠️ **É representação proporcional, não plano de estiva.** A NF-e não traz dimensão de volume — a
 * cubagem é estimada e é um total por nota, não a caixa —, então **não existe como dizer onde cada
 * caixa vai**. A diferença entre "esta fatia do baú é da parada 3" e "esta caixa vai neste canto" é
 * a diferença entre ajudar e enganar, e é por isso que o desenho não sugere posição de peça.
 *
 * Ausência é ausência: sem capacidade conhecida a ocupação não aparece, em vez de mostrar 0% ou
 * 100%; sem cubagem não se desenha o baú.
 */
export function TripCargoPanel({ cargoWeight, layout, occupancy }: TripCargoPanelProps) {
  const { t } = useTranslation('trip')
  if (occupancy === null) return <TripCargoWeightPanel cargoWeight={cargoWeight} />

  const percent = Math.round(Number.parseFloat(occupancy.occupancyRatio) * PERCENT_SCALE)
  const isEstimated = occupancy.source === 'estimated'
  const dimensions = occupancy.capacityDimensions

  return (
    <section aria-labelledby="trip-cargo-title" className={styles.panel}>
      <h3 className={styles.hint} id="trip-cargo-title">
        {t('cargo.title')}
      </h3>
      <p>
        <strong>{t('occupancy.ratio', { percent })}</strong>{' '}
        <span>
          {t('occupancy.loaded', {
            capacity: formatVolume(occupancy.capacityM3),
            loaded: formatVolume(occupancy.loadedM3),
          })}
        </span>
      </p>
      {dimensions === null ? null : (
        <p className={styles.hint}>
          {t('occupancy.dimensions', {
            height: lengthFormatter.format(Number.parseFloat(dimensions.heightM)),
            length: lengthFormatter.format(Number.parseFloat(dimensions.lengthM)),
            volume: formatVolume(occupancy.capacityM3),
            width: lengthFormatter.format(Number.parseFloat(dimensions.widthM)),
          })}
        </p>
      )}
      {isEstimated ? <p className={styles.hint}>{t('occupancy.estimated')}</p> : null}
      {occupancy.capacitySource === 'reference' ? (
        <p className={styles.hint}>{t('occupancy.capacityReference')}</p>
      ) : null}
      {occupancy.documentsWithoutVolume > 0 ? (
        <p className={styles.hint}>
          {t('occupancy.withoutVolume', { count: occupancy.documentsWithoutVolume })}
        </p>
      ) : null}

      <TripCargoWeightLines cargoWeight={cargoWeight} />
      <TripCargoDrawing layout={layout} />
    </section>
  )
}

/**
 * O baú desenhado de lado, com a cabine à esquerda e a porta à direita. As fatias entram na **ordem
 * de carregamento** — a última parada da rota viaja no fundo, colada à cabine —, que é a ordem em
 * que o operador enche o caminhão.
 *
 * ⚠️ A fatia é a **proporção de volume da parada**, não a caixa: ela não diz altura, não diz pilha
 * e não diz canto. Quem mexer aqui não deve fazê-la sugerir posição de peça.
 */
function TripCargoDrawing({ layout }: { layout: TripCargoLayout | null }) {
  const { t } = useTranslation('trip')
  if (layout === null) return null

  const byLoadOrder = [...layout.slices].sort((first, second) => first.loadOrder - second.loadOrder)

  return (
    <>
      <p className={styles.hint}>{t('cargoLayout.loadOrderHint')}</p>

      {/* O desenho é decorativo: a mesma informação sai na lista abaixo, para leitor de tela e impressão. */}
      <div aria-hidden="true" className={styles.truck}>
        <div className={styles.truckCab}>
          <span className={styles.truckWheel} />
        </div>
        <div className={styles.cargoBox}>
          {byLoadOrder.map((slice, index) => (
            <div
              className={styles.cargoSlice}
              key={slice.sequence}
              style={{
                backgroundColor: colorOf(index),
                flexGrow: Number.parseFloat(slice.share),
              }}
            >
              <span className={styles.cargoSliceOrder}>{slice.loadOrder}</span>
            </div>
          ))}
          <div className={styles.cargoFree} style={{ flexGrow: freeShare(layout) }} />
          <span className={styles.truckWheel} />
        </div>
      </div>
      <p className={styles.truckEnds} aria-hidden="true">
        <span>{t('cargoLayout.bottom')}</span>
        <span>{t('cargoLayout.door')}</span>
      </p>

      <ul className={styles.cargoLegend} role="list">
        {byLoadOrder.map((slice, index) => (
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
    </>
  )
}

/**
 * ⚠️ **A marca de estimativa nunca sai do lado do número**, pela mesma razão da ocupação: o peso
 * pode vir de `qVol × padrão da empresa` em vez do `pesoB` do emitente, e um número sem a marca lê
 * como declarado.
 *
 * **Não há percentual.** A ficha do veículo não guarda capacidade em massa; um teto inventado para
 * produzir porcentagem é o número que faria alguém parar de carregar, ou continuar.
 */
function TripCargoWeightLines({ cargoWeight }: { cargoWeight: TripCargoWeight | null }) {
  const { t } = useTranslation('trip')
  if (cargoWeight === null) return null

  const isWeightEstimated = cargoWeight.source === 'estimated'

  return (
    <>
      <p>
        <strong>{t('cargoWeight.title')}</strong>{' '}
        <span>
          {t('cargoWeight.total', {
            weight: weightFormatter.format(Number.parseFloat(cargoWeight.grossWeightKilograms)),
          })}
        </span>
      </p>
      {isWeightEstimated ? <p className={styles.hint}>{t('cargoWeight.estimated')}</p> : null}
      {cargoWeight.documentsWithoutWeight > 0 ? (
        <p className={styles.hint}>
          {t('cargoWeight.withoutWeight', { count: cargoWeight.documentsWithoutWeight })}
        </p>
      ) : null}
    </>
  )
}

/**
 * Veículo sem cubagem cadastrada é o caso comum, e o peso continua sendo o que se quer ler — por
 * isso ele tem painel próprio quando a ocupação não desenha nada.
 */
function TripCargoWeightPanel({ cargoWeight }: { cargoWeight: TripCargoWeight | null }) {
  const { t } = useTranslation('trip')
  if (cargoWeight === null) return null

  return (
    <section aria-labelledby="trip-cargo-weight-title" className={styles.panel}>
      <h3 className={styles.hint} id="trip-cargo-weight-title">
        {t('cargoWeight.title')}
      </h3>
      <TripCargoWeightLines cargoWeight={cargoWeight} />
    </section>
  )
}

/** O espaço livre é o resto — e ele nunca é negativo: o excedente é dito fora, não comprimido. */
function freeShare(layout: TripCargoLayout): number {
  const used = layout.slices.reduce((total, slice) => total + Number.parseFloat(slice.share), 0)
  return Math.max(0, 1 - used)
}
