/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { OverEarlierDeliveryRow } from '../shared/cargoOverEarlier.service'
import styles from '../styles/trip.module.css'

type TripCargoOverEarlierListProps = Readonly<{
  rows: readonly OverEarlierDeliveryRow[]
}>

/**
 * Spec 148 D5: a lista "Caixas por cima". Cada linha diz a caixa, a nota, a entrega dela, a entrega
 * que ela cobre e a parada em que o conferente a tira do caminho para descarregar a de baixo.
 */
export function TripCargoOverEarlierList({ rows }: TripCargoOverEarlierListProps) {
  const { t } = useTranslation('trip')
  if (rows.length === 0) return null

  const total = rows.reduce((sum, row) => sum + row.boxes, 0)

  return (
    <div className={styles.cargoNotes}>
      <p className={styles.hint} id="trip-cargo-over-earlier-title">
        {t('cargoLayers.overEarlier.title', { count: total })}
      </p>
      <ul
        aria-labelledby="trip-cargo-over-earlier-title"
        className={styles.cargoUnplaced}
        role="list"
      >
        {rows.map((row) => {
          const values = {
            count: row.boxes,
            covers: row.coversStops.join(', '),
            label: row.label,
            note:
              row.documentNumber === null
                ? t('cargoLayers.invoice.withoutNumber')
                : t('cargoLayers.invoice.number', { number: row.documentNumber }),
            stop: row.stopSequence,
          }
          return (
            <li
              key={`${row.documentId ?? ''}-${row.label}-${String(row.stopSequence)}-${values.covers}`}
            >
              {row.clearAtStop === null
                ? t('cargoLayers.overEarlier.rowWithoutStop', values)
                : t('cargoLayers.overEarlier.row', { ...values, clearAt: row.clearAtStop })}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
