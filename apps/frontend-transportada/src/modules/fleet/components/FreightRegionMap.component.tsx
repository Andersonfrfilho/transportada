/* Copyright (c) 2026 Ada Technology. MIT License. */
import { lazy, Suspense, useMemo, useState, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useFreightRegionMap } from '../hooks/useFreightRegionMap.hook'
import { BRAZIL_STATE } from '../shared/fleet.types'
import type { FreightRegion, FreightRegionCity } from '../shared/freightRegion.types'
import { cityKeyOf } from '../shared/regionCityName.service'
import styles from '../styles/fleet.module.css'
import { FleetSelectField } from './FleetField.component'

/**
 * ⚠️ O mapa entra por `lazy`, mesmo motivo do mapa da viagem: o MapLibre sozinho estoura o teto de
 * 2 MiB do precache do PWA se entrar no pacote principal — e a aba Regiões nem sempre abre.
 */
const FreightRegionVectorMap = lazy(async () => ({
  default: (await import('./FreightRegionVectorMap.component')).FreightRegionVectorMap,
}))

const MAP_HEIGHT = '26rem'

type FreightRegionMapProps = Readonly<{
  cities?: readonly FreightRegionCity[] | undefined
  fetch?: typeof globalThis.fetch | undefined
  onChange?: ((cities: readonly FreightRegionCity[]) => void) | undefined
  regions: readonly FreightRegion[]
}>

/**
 * O mapa localiza, não arbitra: cidade reivindicada por duas rotas é pintada pela primeira e nomeada
 * por todas no `title` da forma. Quem decide qual rota fica é a tabela, que é onde o preço mora.
 */
export function FreightRegionMap(props: FreightRegionMapProps): JSX.Element {
  const { t } = useTranslation('fleet')
  const entry = useFreightRegionMap(props)
  const [hasBasemap, setHasBasemap] = useState(true)
  const cities = props.cities
  /**
   * L6 — `Set` novo a cada render dispara `setFeatureState` em toda forma dentro do motor MapLibre
   * (efeito por identidade de referência, não de conteúdo). `useMemo` só refaz quando a cidade
   * selecionada, o desenho ou o estado mudam de verdade.
   */
  const selectedCodes = useMemo(() => {
    const selectedKeys = new Set((cities ?? []).map(cityKeyOf))
    return new Set(
      entry.model.shapes
        .filter((shape) => selectedKeys.has(cityKeyOf({ city: shape.city, state: entry.state })))
        .map((shape) => shape.code),
    )
  }, [cities, entry.model.shapes, entry.state])

  return (
    <section className={styles.mapPanel}>
      <h3>{t('regionMap.title')}</h3>
      <small className={styles.fieldHint}>{t('regionMap.hint')}</small>
      <FleetSelectField
        clearable
        label={t('regionMap.state')}
        optionLabelKey="stateOption"
        options={BRAZIL_STATE}
        placeholder={t('regionCities.stateUnset')}
        value={entry.state}
        onChange={entry.changeState}
      />
      {entry.isLoading ? (
        <SkeletonGroup label={t('loading')}>
          <Skeleton height="18rem" width="100%" />
        </SkeletonGroup>
      ) : null}
      {entry.hasFailed ? (
        <p className={styles.cityUnmatched} role="status">
          {t('regionMap.failed')}
        </p>
      ) : null}
      {!entry.isLoading && !entry.hasFailed && entry.model.shapes.length === 0 ? (
        <p className={styles.fieldHint}>{t('regionMap.empty')}</p>
      ) : null}
      {entry.model.shapes.length > 0 && hasBasemap ? (
        <Suspense
          fallback={
            <SkeletonGroup label={t('loading')}>
              <Skeleton height={MAP_HEIGHT} variant="block" />
            </SkeletonGroup>
          }
        >
          <FreightRegionVectorMap
            ariaLabel={t('regionMap.title')}
            onBasemapMissing={() => setHasBasemap(false)}
            selectedCodes={selectedCodes}
            shapes={entry.model.shapes}
            {...(entry.isEditing ? { onSelect: entry.selectShape } : {})}
          />
        </Suspense>
      ) : null}
      {entry.model.shapes.length > 0 && !hasBasemap ? (
        <p className={styles.fieldHint}>{t('regionMap.withoutBasemap')}</p>
      ) : null}
      {entry.legend.length > 0 ? (
        <div className={styles.mapLegend}>
          <strong>{t('regionMap.legendTitle')}</strong>
          <ul>
            {entry.legend.map((zone) => (
              <li key={zone}>
                <span
                  aria-hidden="true"
                  className={styles.mapLegendSwatch}
                  data-zone={String(zone)}
                />
                {t('regionMap.zone', { zone })}
              </li>
            ))}
            <li>
              <span aria-hidden="true" className={styles.mapLegendSwatch} data-zone="unassigned" />
              {t('regionMap.unassigned')}
            </li>
          </ul>
        </div>
      ) : null}
      {entry.model.outside.length > 0 ? (
        <div className={styles.cityUnmatched} role="status">
          <strong>{t('regionMap.outsideTitle')}</strong>
          <small>{t('regionMap.outsideHint')}</small>
          <ul>
            {entry.model.outside.map((missing) => (
              <li key={cityKeyOf(missing)}>
                {missing.city}/{missing.state} — {missing.regionName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
