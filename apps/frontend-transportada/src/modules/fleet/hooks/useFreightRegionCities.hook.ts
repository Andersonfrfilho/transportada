/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import type { FreightRegionCity } from '../shared/freightRegion.types'
import {
  MUNICIPALITY_QUERY_KEY,
  MUNICIPALITY_STALE_TIME_MS,
  buildMunicipalityChoices,
  listMunicipalities,
} from '../shared/municipality.service'
import type { MunicipalityChoice } from '../shared/municipality.service'
import {
  cityKeyOf,
  resolveRegionCityEntry,
  splitRegionCityNames,
} from '../shared/regionCityName.service'

type UseFreightRegionCitiesInput = Readonly<{
  cities: readonly FreightRegionCity[]
  onChange: (cities: readonly FreightRegionCity[]) => void
  fetch?: typeof globalThis.fetch
}>

export type FreightRegionCitiesController = Readonly<{
  addPastedCities: () => void
  changePastedNames: (value: string) => void
  changeState: (value: string) => void
  cityChoices: readonly MunicipalityChoice[]
  clearCities: () => void
  duplicated: readonly string[]
  hasState: boolean
  isListUnavailable: boolean
  isLoadingCities: boolean
  pastedNames: string
  removeCity: (city: FreightRegionCity) => void
  selectCity: (value: string) => void
  state: string
  unmatched: readonly string[]
}>

export function useFreightRegionCities(
  input: UseFreightRegionCitiesInput,
): FreightRegionCitiesController {
  const [state, setState] = useState('')
  const [pastedNames, setPastedNames] = useState('')
  const [duplicated, setDuplicated] = useState<readonly string[]>([])
  const [unmatched, setUnmatched] = useState<readonly string[]>([])
  const { cities, fetch: injectedFetch, onChange } = input
  const fetchImplementation = useMemo(
    () => injectedFetch ?? globalThis.fetch.bind(globalThis),
    [injectedFetch],
  )

  const municipalityQuery = useQuery({
    enabled: state !== '',
    queryFn: ({ signal }) => listMunicipalities({ fetch: fetchImplementation, signal, state }),
    queryKey: [MUNICIPALITY_QUERY_KEY, state],
    staleTime: MUNICIPALITY_STALE_TIME_MS,
  })
  const municipalities = municipalityQuery.data ?? []

  /** A cidade que já é da zona sai da lista: oferecê-la só produziria o aviso de repetida. */
  const cityChoices = useMemo(() => {
    const present = new Set(cities.map(cityKeyOf))

    return buildMunicipalityChoices({ municipalities, selected: '' }).filter(
      (choice) => !present.has(cityKeyOf({ city: choice.value, state })),
    )
  }, [cities, municipalities, state])

  function apply(names: readonly string[]): void {
    const result = resolveRegionCityEntry({ cities, municipalities, names, state })
    setDuplicated(result.duplicated)
    setUnmatched(result.unmatched)
    if (result.added.length > 0) onChange(result.cities)
  }

  function changeState(value: string): void {
    setDuplicated([])
    setUnmatched([])
    setState(value)
  }

  /** A área de colagem esvazia porque o que não casou já voltou nomeado no bloco de baixo. */
  function addPastedCities(): void {
    apply(splitRegionCityNames(pastedNames))
    setPastedNames('')
  }

  function selectCity(value: string): void {
    apply([value])
  }

  function removeCity(city: FreightRegionCity): void {
    const key = cityKeyOf(city)
    onChange(cities.filter((current) => cityKeyOf(current) !== key))
  }

  function clearCities(): void {
    setDuplicated([])
    setUnmatched([])
    onChange([])
  }

  return {
    addPastedCities,
    changePastedNames: setPastedNames,
    changeState,
    cityChoices,
    clearCities,
    duplicated,
    hasState: state !== '',
    isListUnavailable: state !== '' && !municipalityQuery.isLoading && municipalities.length === 0,
    isLoadingCities: municipalityQuery.isLoading,
    pastedNames,
    removeCity,
    selectCity,
    state,
    unmatched,
  }
}
