/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createCameraMeasurementExportClient,
  type CameraMeasurementExportPage,
} from '../shared/cameraMeasurementExportClient.service'
import { summarizeCameraMeasurementValidation } from '../shared/cameraMeasurementValidation.service'

export const CAMERA_MEASUREMENT_EXPORT_QUERY_KEY = 'nfe-package-box-measurements'
export const CAMERA_MEASUREMENT_EXPORT_PAGE_SIZE = 100

function createClient() {
  return createCameraMeasurementExportClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function readErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

/** `DateRangePicker` devolve `AAAA-MM-DD` (dia); a API exige `z.iso.datetime()` (instante). */
function startOfDayIso(isoDate: string): string {
  return `${isoDate}T00:00:00.000Z`
}

function endOfDayIso(isoDate: string): string {
  return `${isoDate}T23:59:59.999Z`
}

export type UseCameraMeasurementExportInput = Readonly<{
  companyId?: string
  /** Só a aba de caixas com `settings.manage` liga a consulta — ver `resolveSettingsDataScope`. */
  enabled: boolean
}>

/**
 * Spec 152 T12 (R6/R8): a mesma listagem paginada por cursor alimenta o resumo da validação e o CSV
 * — todas as páginas já carregadas entram nos dois, nunca só a primeira.
 */
export function useCameraMeasurementExport(input: UseCameraMeasurementExportInput) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const client = createClient()
  const period = {
    from: from === '' ? undefined : startOfDayIso(from),
    to: to === '' ? undefined : endOfDayIso(to),
  }

  const query = useInfiniteQuery({
    enabled: input.enabled && input.companyId !== undefined,
    getNextPageParam: (lastPage: CameraMeasurementExportPage) => lastPage.nextCursor,
    initialPageParam: null as null | string,
    queryFn: ({ pageParam }) =>
      client.listMeasurements({
        cursor: pageParam,
        from: period.from,
        limit: CAMERA_MEASUREMENT_EXPORT_PAGE_SIZE,
        to: period.to,
      }),
    queryKey: [
      CAMERA_MEASUREMENT_EXPORT_QUERY_KEY,
      input.companyId,
      period.from,
      period.to,
    ] as const,
  })

  const entries = query.data?.pages.flatMap((page) => page.items) ?? []

  return {
    entries,
    errorCode: readErrorCode(query.error),
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
    from,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    setPeriod: (nextFrom: string, nextTo: string) => {
      setFrom(nextFrom)
      setTo(nextTo)
    },
    summary: summarizeCameraMeasurementValidation(entries),
    to,
  }
}

export type CameraMeasurementExportController = ReturnType<typeof useCameraMeasurementExport>
