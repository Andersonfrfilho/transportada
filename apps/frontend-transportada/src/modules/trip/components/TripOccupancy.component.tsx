/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { TripOccupancy } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripOccupancyProps = {
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
export function TripOccupancyPanel({ occupancy }: TripOccupancyProps) {
  const { t } = useTranslation('trip')
  if (occupancy === null) return null

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
    </section>
  )
}
