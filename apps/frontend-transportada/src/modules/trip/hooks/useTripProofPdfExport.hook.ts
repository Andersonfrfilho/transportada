/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createTripProofPdfFetch,
  exportTripProofPdf,
  TripProofPdfTooLargeError,
  type TripProofPdfFetch,
  type TripProofPdfFetchRows,
  type TripProofPdfProgress,
  type TripProofPdfSave,
} from '../shared/tripProofPdf.service'
import { fetchTripReportBatches, type TripReportScope } from '../shared/tripReport.service'
import { createTripReportFetchPage } from '../shared/tripReportClient.service'

export type UseTripProofPdfExportInput = Readonly<{
  fetchPdf?: TripProofPdfFetch
  fetchRows?: TripProofPdfFetchRows
  savePdf?: TripProofPdfSave
  scope: TripReportScope
}>

export type TripProofPdfCancellation = Readonly<{ saved: number; total: number | undefined }>

function getDefaultFetchPdf(): TripProofPdfFetch {
  return createTripProofPdfFetch({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function getDefaultFetchRows(): TripProofPdfFetchRows {
  const fetchPage = createTripReportFetchPage({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
  return async ({ scope, signal }) => {
    const result = await fetchTripReportBatches({
      fetchPage,
      scope,
      ...(signal === undefined ? {} : { signal }),
    })
    return result.rows
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.code === DOMException.ABORT_ERR
}

export function useTripProofPdfExport(input: UseTripProofPdfExportInput) {
  const controllerRef = useRef<AbortController | undefined>(undefined)
  const progressRef = useRef<TripProofPdfProgress | undefined>(undefined)
  const [progress, setProgress] = useState<TripProofPdfProgress | undefined>(undefined)
  const [cancellation, setCancellation] = useState<TripProofPdfCancellation | undefined>(undefined)

  function reportProgress(next: TripProofPdfProgress | undefined): void {
    progressRef.current = next
    setProgress(next)
  }

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const controller = new AbortController()
      controllerRef.current = controller
      setCancellation(undefined)
      await exportTripProofPdf({
        fetchPdf: input.fetchPdf ?? getDefaultFetchPdf(),
        fetchRows: input.fetchRows ?? ((request) => getDefaultFetchRows()(request)),
        onProgress: reportProgress,
        scope: input.scope,
        signal: controller.signal,
        ...(input.savePdf === undefined ? {} : { savePdf: input.savePdf }),
      })
    },
    onError: (error) => {
      if (!isAbort(error)) return
      const last = progressRef.current
      setCancellation({ saved: last?.completed ?? 0, total: last?.total })
    },
    onSettled: () => {
      controllerRef.current = undefined
      reportProgress(undefined)
    },
  })

  function handleCancel(): void {
    controllerRef.current?.abort()
  }

  const error = isAbort(mutation.error) ? undefined : (mutation.error ?? undefined)
  return {
    cancellation,
    cancelExport: handleCancel,
    error,
    exportPdf: () => mutation.mutateAsync().catch(() => undefined),
    isExporting: mutation.isPending,
    isTooLarge: error instanceof TripProofPdfTooLargeError,
    maxBlocks: error instanceof TripProofPdfTooLargeError ? error.maxBlocks : undefined,
    progress,
  }
}
