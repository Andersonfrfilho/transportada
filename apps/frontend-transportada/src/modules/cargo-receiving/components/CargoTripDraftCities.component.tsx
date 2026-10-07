/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import type { CargoPreviewTripDraftCity } from '../shared/cargoPreviewTripDraft.types'
import styles from '../styles/cargoTripDraft.module.css'

type CargoTripDraftCitiesProps = Readonly<{ cities: readonly CargoPreviewTripDraftCity[] }>

/** As cidades do roteiro: a nota vinculada traz o nome do XML; a linha que espera o XML, o texto da planilha. */
export function CargoTripDraftCities({ cities }: CargoTripDraftCitiesProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')
  if (cities.length === 0) return null

  return (
    <ul aria-label={t('preview.drafts.card.cities')} className={styles.cities}>
      {cities.map((city) => (
        <li
          className={styles.city}
          data-city-ibge={city.cityIbgeCode ?? ''}
          key={`${city.cityIbgeCode ?? ''}|${city.cityName ?? ''}`}
        >
          <span>{city.cityName ?? t('preview.drafts.card.cityUnknown')}</span>
          {city.documentCount > 0 ? (
            <span className={styles.cityCount}>
              {t('preview.drafts.card.cityDocuments', { count: city.documentCount })}
            </span>
          ) : null}
          {city.pendingLineCount > 0 ? (
            <span className={styles.cityCount}>
              {t('preview.drafts.card.cityPending', { count: city.pendingLineCount })}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
