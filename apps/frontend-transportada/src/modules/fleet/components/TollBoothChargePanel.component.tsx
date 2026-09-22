/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T204: a aba de pedágio passa a mostrar o catálogo inteiro (RF1/RF6) — busca e paginação
 * do servidor (D2), cabeçalho com total, data e estado do catálogo (RF2/D5). Aceites 1 e 2 fecham
 * aqui. Bloco de recarga do extrato é T303, fora desta task.
 */
import { useTranslation } from 'react-i18next'

import { useDayFormatter } from '../hooks/useDayFormatter.hook'
import type { TollBoothChargeAdjustment } from '../hooks/useTollBoothCharges.hook'
import type { TollBoothCatalogPage } from '../shared/tollBoothCatalog.validation'
import styles from '../styles/fleet.module.css'
import {
  TollBoothCatalogHeader,
  TollBoothCatalogPagination,
} from './TollBoothCatalogSummary.component'
import { TollBoothChargeRow, TollBoothChargeSkeleton } from './TollBoothChargeRow.component'

export type TollBoothChargePanelProps = Readonly<{
  catalog: TollBoothCatalogPage | undefined
  disabled: boolean
  errorCode?: string
  loading: boolean
  onAdjust: (input: TollBoothChargeAdjustment) => void
  onClear: (osmNodeId: number) => void
  onPageChange: (page: number) => void
  onSearchChange: (value: string) => void
  saved: boolean
  search: string
}>

export function TollBoothChargePanel(props: TollBoothChargePanelProps) {
  const { t } = useTranslation('fleet')
  const formatDay = useDayFormatter()
  const { catalog } = props
  const hasSearch = props.search.trim() !== ''
  // Catálogo nunca carregado: o corpo já diz isso — cabeçalho zerado e busca seriam ruído repetido.
  const isCatalogEmpty = catalog?.summary.status === 'empty'

  return (
    <section
      className={`${styles.panel} ${styles.tollBoothPanel}`}
      aria-labelledby="toll-booth-charges-title"
    >
      <h2 id="toll-booth-charges-title">{t('tollBoothCharges.title')}</h2>
      <p className={styles.hint}>{t('tollBoothCharges.hint')}</p>
      {isCatalogEmpty ? null : (
        <label className={styles.filterBar}>
          <span>{t('tollBoothCharges.catalog.searchLabel')}</span>
          <input
            type="search"
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </label>
      )}
      {catalog === undefined || isCatalogEmpty ? null : (
        <TollBoothCatalogHeader summary={catalog.summary} />
      )}
      {props.loading ? (
        <TollBoothChargeSkeleton />
      ) : catalog === undefined ? (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('tollBoothCharges.loadError')}
        </p>
      ) : catalog.summary.status === 'empty' ? (
        <p className={styles.fieldHint}>{t('tollBoothCharges.catalog.status.empty')}</p>
      ) : catalog.data.length === 0 ? (
        <p className={styles.fieldHint}>
          {hasSearch
            ? t('tollBoothCharges.catalog.searchEmpty', {
                date:
                  catalog.summary.observedOn === null ? '' : formatDay(catalog.summary.observedOn),
              })
            : t('tollBoothCharges.empty')}
        </p>
      ) : (
        <>
          <div className={styles.fuelPriceList}>
            {catalog.data.map((entry) => (
              <TollBoothChargeRow
                key={`toll-booth-charge-${entry.osmNodeId}`}
                disabled={props.disabled}
                entry={entry}
                onAdjust={props.onAdjust}
                onClear={props.onClear}
              />
            ))}
          </div>
          <TollBoothCatalogPagination
            onPageChange={props.onPageChange}
            pagination={catalog.pagination}
          />
        </>
      )}
      {props.saved && (
        <p className={styles.fuelPriceStatusSuccess} role="status">
          {t('tollBoothCharges.saved')}
        </p>
      )}
      {props.errorCode !== undefined && (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('tollBoothCharges.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
