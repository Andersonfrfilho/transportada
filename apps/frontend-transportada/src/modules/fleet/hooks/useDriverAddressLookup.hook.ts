/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  POSTAL_CODE_LENGTH,
  formatPostalCode,
  stripPostalCode,
} from '@/modules/shared/postalCode.service'

import type { AddressSuggestion, GeoPoint } from '../shared/driverAddress.service'
import {
  ADDRESS_SEARCH_MINIMUM_LENGTH,
  buildMapEmbedUrl,
  locateAddress,
  lookupPostalCode,
  searchAddress,
} from '../shared/driverAddress.service'
import type { FleetDriverFormState } from '../shared/fleet.types'
import type { MunicipalityChoice } from '../shared/municipality.service'
import {
  MUNICIPALITY_QUERY_KEY,
  MUNICIPALITY_STALE_TIME_MS,
  buildMunicipalityChoices,
  listMunicipalities,
} from '../shared/municipality.service'

const SEARCH_DEBOUNCE_MS = 400
const LOCATE_DEBOUNCE_MS = 900

type UseDriverAddressLookupInput = Readonly<{
  fetch?: typeof globalThis.fetch
  patch: (values: Partial<FleetDriverFormState>) => void
  state: FleetDriverFormState
}>

export type DriverAddressLookupController = Readonly<{
  changePostalCode: (value: string) => void
  changeSearchTerm: (value: string) => void
  cityChoices: readonly MunicipalityChoice[]
  hasCityState: boolean
  isLoadingCities: boolean
  isSearching: boolean
  mapUrl: null | string
  searchTerm: string
  selectSuggestion: (suggestion: AddressSuggestion) => void
  statusKey: null | string
  suggestions: readonly AddressSuggestion[]
}>

type GuardedRequest = <TResult>(
  perform: (signal: AbortSignal) => Promise<TResult>,
  accept: (result: TResult) => void,
) => void

/**
 * O provedor mais lento é o que responde por último, não o que foi pedido por último: sem o número
 * de sequência o CEP anterior sobrescreve o atual, e quem digitou vê o endereço do vizinho.
 */
function useGuardedRequest(): GuardedRequest {
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )

  return useCallback((perform, accept) => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    sequence.current += 1
    const ticket = sequence.current
    void perform(current.signal)
      .then((result) => {
        if (ticket !== sequence.current) return
        accept(result)
      })
      .catch(() => {
        /* Provedor fora do ar ou pedido abortado não é erro de cadastro: o campo segue digitável. */
      })
  }, [])
}

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
  const [statusKey, setStatusKey] = useState<null | string>(null)
  const [point, setPoint] = useState<GeoPoint | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const runPostalCode = useGuardedRequest()
  const runSearch = useGuardedRequest()
  const runLocate = useGuardedRequest()

  const { addressCity, addressDistrict, addressNumber, addressState, addressStreet } = state
  const canLocate = addressStreet !== '' && addressCity !== ''

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
    if (!canLocate) {
      setPoint(null)
      return
    }
    const timer = setTimeout(() => {
      runLocate(
        (signal) =>
          locateAddress({
            fetch: fetchImplementation,
            signal,
            suggestion: {
              city: addressCity,
              district: addressDistrict,
              label: '',
              number: addressNumber,
              point: null,
              postalCode: '',
              state: addressState,
              street: addressStreet,
            },
          }),
        setPoint,
      )
    }, LOCATE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [
    addressCity,
    addressDistrict,
    addressNumber,
    addressState,
    addressStreet,
    canLocate,
    fetchImplementation,
    runLocate,
  ])

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
          setStatusKey(found.length === 0 ? 'addressSearchEmpty' : null)
        },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [fetchImplementation, runSearch, searchTerm])

  function changePostalCode(value: string): void {
    patch({ addressPostalCode: formatPostalCode(value) })
    setStatusKey(null)
    const digits = stripPostalCode(value)
    if (digits.length !== POSTAL_CODE_LENGTH) return
    setStatusKey('addressLookupPending')
    runPostalCode(
      (signal) => lookupPostalCode({ fetch: fetchImplementation, signal, term: digits }),
      (suggestion) => {
        if (suggestion === null) {
          setStatusKey('addressLookupMissing')
          return
        }
        patch(toAddressPatch(suggestion))
        setStatusKey('addressLookupFound')
      },
    )
  }

  function changeSearchTerm(value: string): void {
    setStatusKey(null)
    setSearchTerm(value)
  }

  function selectSuggestion(suggestion: AddressSuggestion): void {
    patch(toAddressPatch(suggestion))
    setSuggestions([])
    setSearchTerm('')
    setStatusKey(null)
    if (suggestion.point !== null) setPoint(suggestion.point)
  }

  return {
    changePostalCode,
    changeSearchTerm,
    cityChoices,
    hasCityState: addressState !== '',
    isLoadingCities: municipalityQuery.isLoading,
    isSearching,
    mapUrl: point === null ? null : buildMapEmbedUrl(point),
    searchTerm,
    selectSuggestion,
    statusKey,
    suggestions,
  }
}
