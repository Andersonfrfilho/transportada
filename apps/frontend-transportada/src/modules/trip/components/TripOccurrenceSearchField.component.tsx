/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import styles from '../styles/trip.module.css'

/** Spec 277 RF3: digitar não pergunta ao servidor a cada tecla — espera a pessoa parar. */
export const TRIP_OCCURRENCE_SEARCH_DEBOUNCE_MS = 300

type TripOccurrenceSearchFieldProps = Readonly<{
  onSearch: (value: string) => void
  /** O valor aplicado hoje; muda de fora (limpar filtros) e o campo acompanha. */
  value: string
}>

/**
 * Spec 277 RF1/RF3: um campo só que procura em nota, motorista, veículo, empresas, cidade e andamento.
 * O texto digitado fica local até o debounce vencer; limpar de fora (`value` volta a vazio) esvazia o campo.
 */
export function TripOccurrenceSearchField({ onSearch, value }: TripOccurrenceSearchFieldProps) {
  const { t } = useTranslation('trip')
  const [draft, setDraft] = useState(value)
  /** O pai recria `onSearch` a cada render; guardá-lo aqui impede de reiniciar a espera a cada tecla dos vizinhos. */
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => onSearchRef.current(draft), TRIP_OCCURRENCE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, value])

  return (
    <div className={styles.occurrenceSearch}>
      <Icon name="search" />
      <input
        aria-label={t('occurrenceFeed.search.label')}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t('occurrenceFeed.search.placeholder')}
        type="search"
        value={draft}
      />
    </div>
  )
}
