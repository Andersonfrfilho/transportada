/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createTripProofPdfFetch,
  exportTripProofPdf,
  TripProofPdfTooLargeError,
  TripProofPdfTooManyDocumentsError,
  type TripProofPdfFetch,
  type TripProofPdfSave,
} from '../shared/tripProofPdf.service'
import type { TripReportScope } from '../shared/tripReport.service'

export type UseTripProofPdfExportInput = Readonly<{
  fetchPdf?: TripProofPdfFetch
  savePdf?: TripProofPdfSave
  scope: TripReportScope
}>

function getDefaultFetchPdf(): TripProofPdfFetch {
  return createTripProofPdfFetch({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function useTripProofPdfExport(input: UseTripProofPdfExportInput) {
  const controllerRef = useRef<AbortController | undefined>(undefined)

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const controller = new AbortController()
      controllerRef.current = controller
      await exportTripProofPdf({
        fetchPdf: input.fetchPdf ?? getDefaultFetchPdf(),
        scope: input.scope,
        signal: controller.signal,
        ...(input.savePdf === undefined ? {} : { savePdf: input.savePdf }),
      })
    },
    onSettled: () => {
      controllerRef.current = undefined
    },
  })

  function handleCancel(): void {
    controllerRef.current?.abort()
  }

  const error = isAbort(mutation.error) ? undefined : (mutation.error ?? undefined)
  return {
    cancelExport: handleCancel,
    error,
    exportPdf: () => mutation.mutateAsync().catch(() => undefined),
    isExporting: mutation.isPending,
    isTooLarge: error instanceof TripProofPdfTooLargeError,
    isTooManyDocuments: error instanceof TripProofPdfTooManyDocumentsError,
    maxBlocks: error instanceof TripProofPdfTooLargeError ? error.maxBlocks : undefined,
  }
}
