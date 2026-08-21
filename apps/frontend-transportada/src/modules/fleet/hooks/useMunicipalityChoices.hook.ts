/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  buildMunicipalityChoices,
  listMunicipalities,
  MUNICIPALITY_QUERY_KEY,
  MUNICIPALITY_STALE_TIME_MS,
  type MunicipalityChoice,
} from '../shared/municipality.service'

export type MunicipalityChoicesController = Readonly<{
  choices: readonly MunicipalityChoice[]
  hasState: boolean
  isLoading: boolean
}>

type UseMunicipalityChoicesInput = Readonly<{
  city: string
  fetch?: typeof globalThis.fetch
  state: string
}>

/**
 * A lista do IBGE é por UF, e a mesma cidade é escolhida em três lugares da ficha — naturalidade,
 * emissão da CNH e endereço. Sem UF não há o que buscar, e o campo volta a ser teclado.
 */
export function useMunicipalityChoices(
  input: UseMunicipalityChoicesInput,
): MunicipalityChoicesController {
  const injectedFetch = input.fetch
  const fetchImplementation = useMemo(
    () => injectedFetch ?? globalThis.fetch.bind(globalThis),
    [injectedFetch],
  )
  const { city, state } = input

  const municipalityQuery = useQuery({
    enabled: state !== '',
    queryFn: ({ signal }) => listMunicipalities({ fetch: fetchImplementation, signal, state }),
    queryKey: [MUNICIPALITY_QUERY_KEY, state],
    staleTime: MUNICIPALITY_STALE_TIME_MS,
  })

  const choices = useMemo(
    () =>
      buildMunicipalityChoices({ municipalities: municipalityQuery.data ?? [], selected: city }),
    [city, municipalityQuery.data],
  )

  return { choices, hasState: state !== '', isLoading: municipalityQuery.isLoading }
}
