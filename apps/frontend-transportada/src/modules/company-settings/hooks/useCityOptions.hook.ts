/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMunicipalityDirectoryQuery } from '../queries/useBusinessCalendar.query'
import { BRAZILIAN_STATES } from '../shared/businessCalendar.constant'

export type CityOptionsStatus = 'error' | 'idle' | 'loading' | 'ready'

export type CityOption = Readonly<{ label: string; value: string }>

/**
 * Os municípios da UF escolhida, pelo código IBGE (a mesma lista do resto do painel). Sem UF não há lista; lista
 * fora do ar vira `error`, e o formulário aceita o código digitado — o cadastro não pode parar por provedor externo.
 */
export function useCityOptions(stateIbgeCode: string) {
  const acronym = BRAZILIAN_STATES.find((state) => state.code === stateIbgeCode)?.acronym ?? ''
  const query = useMunicipalityDirectoryQuery({ acronym, enabled: true })
  const options: readonly CityOption[] = [...(query.data ?? [])]
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
    .map((entry) => ({ label: entry.name, value: entry.code }))
  const status: CityOptionsStatus =
    acronym === '' ? 'idle' : query.isError ? 'error' : query.isPending ? 'loading' : 'ready'

  return { options, status }
}
