/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueries, useQuery, type QueryClient } from '@tanstack/react-query'

import {
  MUNICIPALITY_STALE_TIME_MS,
  type MunicipalityIdentity,
} from '@/modules/fleet/shared/municipality.service'

import { BRAZILIAN_STATES, BUSINESS_CALENDAR_QUERY_KEY } from '../shared/businessCalendar.constant'
import type {
  BusinessCalendarSettings,
  MunicipalHoliday,
  MunicipalHolidayRule,
  StateHoliday,
} from '../shared/businessCalendar.types'
import {
  getBusinessCalendarClient,
  getMunicipalityDirectory,
} from '../shared/businessCalendarClient.provider'

export const BUSINESS_CALENDAR_RESOURCE = {
  MUNICIPAL_HOLIDAYS: 'municipal-holidays',
  MUNICIPAL_RULES: 'municipal-rules',
  SETTINGS: 'settings',
  STATE_HOLIDAYS: 'state-holidays',
} as const

type Resource = (typeof BUSINESS_CALENDAR_RESOURCE)[keyof typeof BUSINESS_CALENDAR_RESOURCE]
type CompanyQuery = Readonly<{ companyId: string | undefined; enabled: boolean }>

export function businessCalendarQueryKey(
  input: Readonly<{ companyId: string | undefined; resource: Resource }>,
) {
  return [BUSINESS_CALENDAR_QUERY_KEY, input.companyId, input.resource] as const
}

/** Cada mutação diz quais leituras mudaram: invalidar tudo refaria quatro listas por um clique. */
export async function invalidateBusinessCalendar(
  input: Readonly<{
    companyId: string | undefined
    queryClient: QueryClient
    resources: readonly Resource[]
  }>,
): Promise<void> {
  await Promise.all(
    input.resources.map((resource) =>
      input.queryClient.invalidateQueries({
        queryKey: businessCalendarQueryKey({ companyId: input.companyId, resource }),
      }),
    ),
  )
}

export function useBusinessCalendarSettingsQuery(input: CompanyQuery) {
  return useQuery<BusinessCalendarSettings>({
    enabled: input.enabled,
    queryFn: () => getBusinessCalendarClient().getSettings(),
    queryKey: businessCalendarQueryKey({
      companyId: input.companyId,
      resource: BUSINESS_CALENDAR_RESOURCE.SETTINGS,
    }),
  })
}

export function useMunicipalRulesQuery(input: CompanyQuery) {
  return useQuery<readonly MunicipalHolidayRule[]>({
    enabled: input.enabled,
    queryFn: () => getBusinessCalendarClient().listRules(),
    queryKey: businessCalendarQueryKey({
      companyId: input.companyId,
      resource: BUSINESS_CALENDAR_RESOURCE.MUNICIPAL_RULES,
    }),
  })
}

export function useMunicipalHolidaysQuery(input: CompanyQuery) {
  return useQuery<readonly MunicipalHoliday[]>({
    enabled: input.enabled,
    queryFn: () => getBusinessCalendarClient().listMunicipalHolidays(),
    queryKey: businessCalendarQueryKey({
      companyId: input.companyId,
      resource: BUSINESS_CALENDAR_RESOURCE.MUNICIPAL_HOLIDAYS,
    }),
  })
}

export function useStateHolidaysQuery(input: CompanyQuery) {
  return useQuery<readonly StateHoliday[]>({
    enabled: input.enabled,
    queryFn: () => getBusinessCalendarClient().listStateHolidays(),
    queryKey: businessCalendarQueryKey({
      companyId: input.companyId,
      resource: BUSINESS_CALENDAR_RESOURCE.STATE_HOLIDAYS,
    }),
  })
}

const DIRECTORY_QUERY_KEY = 'business-calendar-municipality-directory'

function directoryQuery(acronym: string) {
  return {
    queryFn: ({ signal }: Readonly<{ signal: AbortSignal }>) =>
      getMunicipalityDirectory()({ signal, state: acronym }),
    queryKey: [DIRECTORY_QUERY_KEY, acronym] as const,
    staleTime: MUNICIPALITY_STALE_TIME_MS,
  }
}

/** Os municípios de uma UF pelo código IBGE: o formulário escolhe nesta lista, e a tabela lê o nome dela. */
export function useMunicipalityDirectoryQuery(
  input: Readonly<{ acronym: string; enabled: boolean }>,
) {
  return useQuery<readonly MunicipalityIdentity[]>({
    ...directoryQuery(input.acronym),
    enabled: input.enabled && input.acronym !== '',
  })
}

function combineMunicipalityNames(
  results: readonly Readonly<{ data: readonly MunicipalityIdentity[] | undefined }>[],
): ReadonlyMap<string, string> {
  return new Map(
    results.flatMap((result) =>
      (result.data ?? []).map((entry) => [entry.code, entry.name] as const),
    ),
  )
}

/**
 * Nome de cada município que a tabela mostra: uma consulta por UF presente, em paralelo, cada uma isolada — UF cujo
 * provedor falhou fica com o código no lugar do nome, sem derrubar as outras.
 */
export function useMunicipalityNames(stateCodes: readonly string[]): ReadonlyMap<string, string> {
  const acronyms = [...new Set(stateCodes)]
    .map((code) => BRAZILIAN_STATES.find((state) => state.code === code)?.acronym)
    .filter((acronym): acronym is string => acronym !== undefined)
    .sort()
  return useQueries({ combine: combineMunicipalityNames, queries: acronyms.map(directoryQuery) })
}
