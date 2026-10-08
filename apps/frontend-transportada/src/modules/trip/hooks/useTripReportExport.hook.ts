/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  fetchTripReport,
  resolveTripReportFilters,
  TripReportTooLargeError,
  type TripReportScope,
} from '../shared/tripReport.service'
import { createTripReportFetchPage } from '../shared/tripReportClient.service'
import type { TripReportFetchPage, TripReportResult } from '../shared/tripReport.types'

export type TripReportExportProgress = Readonly<{ loaded: number; total: number | undefined }>

export type UseTripReportExportInput = Readonly<{
  /** A planilha em si (linhas + tons + legenda) é de quem monta; sem ela o hook só devolve as linhas. */
  buildSpreadsheet?: (result: TripReportResult) => Promise<void> | void
  fetchPage?: TripReportFetchPage
  scope: TripReportScope
}>

function getDefaultFetchPage(): TripReportFetchPage {
  return createTripReportFetchPage({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useTripReportExport(input: UseTripReportExportInput) {
  const [progress, setProgress] = useState<TripReportExportProgress | undefined>(undefined)
  const controllerRef = useRef<AbortController | undefined>(undefined)

  const mutation = useMutation({
    mutationFn: async (): Promise<TripReportResult> => {
      const controller = new AbortController()
      controllerRef.current = controller
      setProgress({ loaded: 0, total: undefined })
      const result = await fetchTripReport({
        fetchPage: input.fetchPage ?? getDefaultFetchPage(),
        filters: resolveTripReportFilters(input.scope),
        onProgress: (loaded, total) => setProgress({ loaded, total }),
        signal: controller.signal,
      })
      await input.buildSpreadsheet?.(result)
      return result
    },
    onSettled: () => {
      controllerRef.current = undefined
      setProgress(undefined)
    },
  })

  function handleCancel(): void {
    controllerRef.current?.abort()
  }

  const error = isAbort(mutation.error) ? undefined : (mutation.error ?? undefined)
  return {
    cancelExport: handleCancel,
    error,
    exportReport: () => mutation.mutateAsync().catch(() => undefined),
    isExporting: mutation.isPending,
    isTooLarge: error instanceof TripReportTooLargeError,
    maxRows: error instanceof TripReportTooLargeError ? error.maxRows : undefined,
    progress,
  }
}
