/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'

import type { FreightRegion, FreightRegionCity } from '../shared/freightRegion.types'
import type { FreightRegionMapModel } from '../shared/freightRegionMap.service'
import {
  buildFreightRegionMap,
  FREIGHT_REGION_ZONE_FILL,
  resolveDefaultMapState,
  toggleRegionMapCity,
} from '../shared/freightRegionMap.service'
import {
  EMPTY_STATE_MESH,
  IBGE_MESH_QUERY_KEY,
  IBGE_MESH_STALE_TIME_MS,
  loadStateMesh,
} from '@/modules/shared/ibgeMesh.service'
import {
  listMunicipalityIdentities,
  MUNICIPALITY_IDENTITY_QUERY_KEY,
  MUNICIPALITY_STALE_TIME_MS,
} from '../shared/municipality.service'

export type FreightRegionMapInputProps = Readonly<{
  cities?: readonly FreightRegionCity[] | undefined
  fetch?: typeof globalThis.fetch | undefined
  onChange?: ((cities: readonly FreightRegionCity[]) => void) | undefined
  regions: readonly FreightRegion[]
}>

export type FreightRegionMapEntry = Readonly<{
  changeState: (state: string) => void
  hasFailed: boolean
  isEditing: boolean
  isLoading: boolean
  legend: readonly number[]
  model: FreightRegionMapModel
  selectShape: (code: string) => void
  state: string
}>

/** Legenda do que o desenho mostra, não da paleta inteira: zona sem município na UF seria verbete morto. */
function buildLegend(model: FreightRegionMapModel): readonly number[] {
  const zones = new Set<number>()
  for (const shape of model.shapes) {
    if (shape.zone !== null) zones.add(shape.zone)
  }

  return [...zones]
    .filter((zone) => zone < FREIGHT_REGION_ZONE_FILL.length)
    .sort((first, second) => first - second)
}

/**
 * Duas consultas para a mesma UF: a malha dá o polígono e o cadastro do IBGE dá o nome, e é o nome
 * que a zona guarda. Ficam separadas porque a divisa muda por lei e o nome muda por decreto — cache
 * de uma semana contra o de um dia —, e porque malha fora do ar não pode apagar o nome da cidade.
 */
export function useFreightRegionMap(input: FreightRegionMapInputProps): FreightRegionMapEntry {
  const { cities, fetch: injectedFetch, onChange, regions } = input
  const [chosenState, setChosenState] = useState('')
  const defaultState = useMemo(
    () => cities?.[0]?.state ?? resolveDefaultMapState(regions),
    [cities, regions],
  )
  // Derivado, não copiado no mount: em leitura as rotas chegam depois do primeiro render.
  const state = chosenState === '' ? defaultState : chosenState
  const fetchImplementation = useMemo(
    () => injectedFetch ?? globalThis.fetch.bind(globalThis),
    [injectedFetch],
  )

  const meshQuery = useQuery({
    enabled: state !== '',
    queryFn: ({ signal }) => loadStateMesh({ fetch: fetchImplementation, signal, state }),
    queryKey: [IBGE_MESH_QUERY_KEY, state],
    staleTime: IBGE_MESH_STALE_TIME_MS,
  })
  const municipalityQuery = useQuery({
    enabled: state !== '',
    queryFn: ({ signal }) =>
      listMunicipalityIdentities({ fetch: fetchImplementation, signal, state }),
    queryKey: [MUNICIPALITY_IDENTITY_QUERY_KEY, state],
    staleTime: MUNICIPALITY_STALE_TIME_MS,
  })

  const model = useMemo(
    () =>
      buildFreightRegionMap({
        mesh: meshQuery.data ?? EMPTY_STATE_MESH,
        municipalities: municipalityQuery.data ?? [],
        regions,
        state,
      }),
    [meshQuery.data, municipalityQuery.data, regions, state],
  )

  const selectShape = useCallback(
    (code: string) => {
      if (onChange === undefined) return
      const shape = model.shapes.find((candidate) => candidate.code === code)
      if (shape === undefined) return
      onChange(toggleRegionMapCity({ cities: cities ?? [], city: { city: shape.city, state } }))
    },
    [cities, model.shapes, onChange, state],
  )

  return {
    changeState: setChosenState,
    hasFailed: meshQuery.isError || municipalityQuery.isError,
    isEditing: onChange !== undefined,
    isLoading: meshQuery.isLoading || municipalityQuery.isLoading,
    legend: buildLegend(model),
    model,
    selectShape,
    state,
  }
}
