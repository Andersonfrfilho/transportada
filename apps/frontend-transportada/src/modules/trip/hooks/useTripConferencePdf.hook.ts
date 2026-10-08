/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { InstallationBrandView } from '@/modules/identity/hooks/useInstallationBrandView.hook'

import { buildTripConferencePdf, fetchLogoDataUrl } from '../shared/tripConferencePdf.service'
import type { TripConferenceSheetModel } from '../shared/tripConferenceSheet.service'
import {
  buildTripConferenceFileName,
  type TripConferenceSheetLabels,
} from '../shared/tripConferenceSheet.service'

type UseTripConferencePdfInput = Readonly<{
  brand: InstallationBrandView
  tripCode: string
  labels: TripConferenceSheetLabels
  sheet: TripConferenceSheetModel
}>

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function useTripConferencePdf({
  brand,
  labels,
  sheet,
  tripCode,
}: UseTripConferencePdfInput) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)

  async function handleDownload(): Promise<void> {
    setIsGenerating(true)
    setHasFailed(false)
    try {
      const logoDataUrl = await fetchLogoDataUrl(brand.logoUrl)
      const blob = await buildTripConferencePdf({
        brandName: brand.name,
        labels,
        logoDataUrl,
        sheet,
      })

      saveBlob(blob, buildTripConferenceFileName({ at: new Date(), tripCode }))
    } catch {
      setHasFailed(true)
    } finally {
      setIsGenerating(false)
    }
  }

  return { handleDownload, hasFailed, isGenerating }
}
