/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { formatPostalCode } from '@/modules/shared/postalCode.service'
import type { PostalCodeClient } from '@/modules/shared/postalCodeClient.service'
import type { PostalCodeLookupStatus } from '@/modules/shared/usePostalCodeLookup.hook'
import { usePostalCodeLookup } from '@/modules/shared/usePostalCodeLookup.hook'

import type { FleetDriverFormState } from '../shared/fleet.types'
import type { MunicipalityChoice } from '../shared/municipality.service'
import {
  MUNICIPALITY_QUERY_KEY,
  MUNICIPALITY_STALE_TIME_MS,
  buildMunicipalityChoices,
  listMunicipalities,
} from '../shared/municipality.service'

/** Os quatro campos que o CEP sabe preencher, no vocabulário do endereço da empresa. */
const POSTAL_CODE_FIELDS = {
  city: 'linkedAddressCity',
  district: 'linkedAddressDistrict',
  state: 'linkedAddressState',
  street: 'linkedAddressStreet',
} as const

const POSTAL_CODE_STATUS_KEY: Readonly<Record<PostalCodeLookupStatus, null | string>> = {
  found: 'addressLookupFound',
  idle: null,
  missing: 'addressLookupMissing',
  pending: 'addressLookupPending',
}

type UseDriverLinkedAddressInput = Readonly<{
  fetch?: typeof globalThis.fetch
  patch: (values: Partial<FleetDriverFormState>) => void
  postalCodeClient?: PostalCodeClient
  state: FleetDriverFormState
}>

export type DriverLinkedAddressController = Readonly<{
  changePostalCode: (value: string) => void
  cityChoices: readonly MunicipalityChoice[]
  hasCityState: boolean
  isLoadingCities: boolean
  statusKey: null | string
}>

/**
 * Endereço de pessoa jurídica não é dado pessoal, e por isso ele não repete a busca textual do
 * endereço residencial: aqui só o CEP fala com fora, e o resto é digitado.
 */
export function useDriverLinkedAddress(
  input: UseDriverLinkedAddressInput,
): DriverLinkedAddressController {
  const { patch, state } = input
  const injectedFetch = input.fetch
  const fetchImplementation = useMemo(
    () => injectedFetch ?? globalThis.fetch.bind(globalThis),
    [injectedFetch],
  )
  const postalCode = usePostalCodeLookup<FleetDriverFormState>({
    ...(input.postalCodeClient === undefined ? {} : { client: input.postalCodeClient }),
    fields: POSTAL_CODE_FIELDS,
    patch,
  })

  const { linkedAddressCity, linkedAddressState } = state

  const municipalityQuery = useQuery({
    enabled: linkedAddressState !== '',
    queryFn: ({ signal }) =>
      listMunicipalities({ fetch: fetchImplementation, signal, state: linkedAddressState }),
    queryKey: [MUNICIPALITY_QUERY_KEY, linkedAddressState],
    staleTime: MUNICIPALITY_STALE_TIME_MS,
  })
  const cityChoices = useMemo(
    () =>
      buildMunicipalityChoices({
        municipalities: municipalityQuery.data ?? [],
        selected: linkedAddressCity,
      }),
    [linkedAddressCity, municipalityQuery.data],
  )

  function changePostalCode(value: string): void {
    patch({ linkedAddressPostalCode: formatPostalCode(value) })
    postalCode.lookup(value)
  }

  return {
    changePostalCode,
    cityChoices,
    hasCityState: linkedAddressState !== '',
    isLoadingCities: municipalityQuery.isLoading,
    statusKey: POSTAL_CODE_STATUS_KEY[postalCode.status],
  }
}
