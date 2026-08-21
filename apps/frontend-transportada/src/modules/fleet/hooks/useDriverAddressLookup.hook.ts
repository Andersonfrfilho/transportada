/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'

import { formatPostalCode } from '@/modules/shared/postalCode.service'
import type { PostalCodeClient } from '@/modules/shared/postalCodeClient.service'
import { useGuardedRequest } from '@/modules/shared/useGuardedRequest.hook'
import type { PostalCodeLookupStatus } from '@/modules/shared/usePostalCodeLookup.hook'
import { usePostalCodeLookup } from '@/modules/shared/usePostalCodeLookup.hook'

import type { AddressSuggestion } from '../shared/driverAddress.service'
import { ADDRESS_SEARCH_MINIMUM_LENGTH, searchAddress } from '../shared/driverAddress.service'
import type { FleetDriverFormState } from '../shared/fleet.types'
import type { MunicipalityChoice } from '../shared/municipality.service'
import {
  MUNICIPALITY_QUERY_KEY,
  MUNICIPALITY_STALE_TIME_MS,
  buildMunicipalityChoices,
  listMunicipalities,
} from '../shared/municipality.service'

const SEARCH_DEBOUNCE_MS = 400

/** Os quatro campos que o CEP sabe preencher, no vocabulário deste formulário. */
const POSTAL_CODE_FIELDS = {
  city: 'addressCity',
  district: 'addressDistrict',
  state: 'addressState',
  street: 'addressStreet',
} as const

/** O status do CEP é o mesmo dos três formulários; o rótulo continua sendo desta tela. */
const POSTAL_CODE_STATUS_KEY: Readonly<Record<PostalCodeLookupStatus, null | string>> = {
  found: 'addressLookupFound',
  idle: null,
  missing: 'addressLookupMissing',
  pending: 'addressLookupPending',
}

type UseDriverAddressLookupInput = Readonly<{
  fetch?: typeof globalThis.fetch
  patch: (values: Partial<FleetDriverFormState>) => void
  postalCodeClient?: PostalCodeClient
  state: FleetDriverFormState
}>

export type DriverAddressLookupController = Readonly<{
  changePostalCode: (value: string) => void
  changeSearchTerm: (value: string) => void
  cityChoices: readonly MunicipalityChoice[]
  hasCityState: boolean
  isLoadingCities: boolean
  isSearching: boolean
  searchTerm: string
  selectSuggestion: (suggestion: AddressSuggestion) => void
  statusKey: null | string
  suggestions: readonly AddressSuggestion[]
}>

/** Campo que o provedor não soube preencher fica como está: sugestão parcial não apaga o digitado. */
function toAddressPatch(suggestion: AddressSuggestion): Partial<FleetDriverFormState> {
  return {
    ...(suggestion.city === '' ? {} : { addressCity: suggestion.city }),
    ...(suggestion.district === '' ? {} : { addressDistrict: suggestion.district }),
    ...(suggestion.number === '' ? {} : { addressNumber: suggestion.number }),
    ...(suggestion.postalCode === ''
      ? {}
      : { addressPostalCode: formatPostalCode(suggestion.postalCode) }),
    ...(suggestion.state === '' ? {} : { addressState: suggestion.state }),
    ...(suggestion.street === '' ? {} : { addressStreet: suggestion.street }),
  }
}

export function useDriverAddressLookup(
  input: UseDriverAddressLookupInput,
): DriverAddressLookupController {
  const { patch, state } = input
  const injectedFetch = input.fetch
  const fetchImplementation = useMemo(
    () => injectedFetch ?? globalThis.fetch.bind(globalThis),
    [injectedFetch],
  )
  const [suggestions, setSuggestions] = useState<readonly AddressSuggestion[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchStatusKey, setSearchStatusKey] = useState<null | string>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const runSearch = useGuardedRequest()
  const postalCode = usePostalCodeLookup<FleetDriverFormState>({
    ...(input.postalCodeClient === undefined ? {} : { client: input.postalCodeClient }),
    fields: POSTAL_CODE_FIELDS,
    patch,
  })

  const { addressCity, addressState } = state

  const municipalityQuery = useQuery({
    enabled: addressState !== '',
    queryFn: ({ signal }) =>
      listMunicipalities({ fetch: fetchImplementation, signal, state: addressState }),
    queryKey: [MUNICIPALITY_QUERY_KEY, addressState],
    staleTime: MUNICIPALITY_STALE_TIME_MS,
  })
  const cityChoices = useMemo(
    () =>
      buildMunicipalityChoices({
        municipalities: municipalityQuery.data ?? [],
        selected: addressCity,
      }),
    [addressCity, municipalityQuery.data],
  )

  useEffect(() => {
    const term = searchTerm.trim()
    if (term.length < ADDRESS_SEARCH_MINIMUM_LENGTH) {
      setSuggestions([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    const timer = setTimeout(() => {
      runSearch(
        (signal) => searchAddress({ fetch: fetchImplementation, signal, term }),
        (found) => {
          setSuggestions(found)
          setIsSearching(false)
          setSearchStatusKey(found.length === 0 ? 'addressSearchEmpty' : null)
        },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [fetchImplementation, runSearch, searchTerm])

  function changePostalCode(value: string): void {
    patch({ addressPostalCode: formatPostalCode(value) })
    setSearchStatusKey(null)
    postalCode.lookup(value)
  }

  function changeSearchTerm(value: string): void {
    setSearchStatusKey(null)
    postalCode.reset()
    setSearchTerm(value)
  }

  function selectSuggestion(suggestion: AddressSuggestion): void {
    patch(toAddressPatch(suggestion))
    setSuggestions([])
    setSearchTerm('')
    setSearchStatusKey(null)
    postalCode.reset()
  }

  return {
    changePostalCode,
    changeSearchTerm,
    cityChoices,
    hasCityState: addressState !== '',
    isLoadingCities: municipalityQuery.isLoading,
    isSearching,
    searchTerm,
    selectSuggestion,
    statusKey: POSTAL_CODE_STATUS_KEY[postalCode.status] ?? searchStatusKey,
    suggestions,
  }
}
