/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { TripCargoWeight, TripOccupancy } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripOccupancyProps = {
  cargoWeight: TripCargoWeight | null
  occupancy: TripOccupancy | null
}

const PERCENT_SCALE = 100

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

function formatVolume(value: string): string {
  return volumeFormatter.format(Number.parseFloat(value))
}

/**
 * Spec 075: quanto do baú já foi ocupado.
 *
 * ⚠️ **A marca de estimativa nunca sai do lado do número.** O valor sai de um fator por volume, não
 * de medida — quem carrega decide olhando isto, e um número sem a marca lê como medido. Há contrato
 * (`test/trip/occupancy.contract.ts`) que reprova o componente se o percentual aparecer sozinho.
 *
 * Ausência é ausência: sem capacidade conhecida o painel não aparece, em vez de mostrar 0% ou 100%.
 */
export function TripOccupancyPanel({ cargoWeight, occupancy }: TripOccupancyProps) {
  const { t } = useTranslation('trip')
  if (occupancy === null) return <TripCargoWeightPanel cargoWeight={cargoWeight} />

  const percent = Math.round(Number.parseFloat(occupancy.occupancyRatio) * PERCENT_SCALE)
  const isEstimated = occupancy.source === 'estimated'
  const dimensions = occupancy.capacityDimensions

  return (
    <section aria-labelledby="trip-occupancy-title" className={styles.panel}>
      <h3 className={styles.hint} id="trip-occupancy-title">
        {t('occupancy.title')}
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
    </section>
  )
}

const weightFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

/**
 * ⚠️ **A marca de estimativa nunca sai do lado do número**, pela mesma razão da ocupação: o peso
 * pode vir de `qVol × padrão da empresa` em vez do `pesoB` do emitente, e um número sem a marca lê
 * como declarado. `test/trip/cargo-weight.contract.ts` reprova o componente se ela sumir, e reprova
 * também se ela ganhar segunda condição.
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
