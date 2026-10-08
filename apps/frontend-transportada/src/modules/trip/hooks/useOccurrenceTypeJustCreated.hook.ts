/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useEffect, useState } from 'react'

import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

export function buildOccurrenceTypeSummaryId(typeId: string): string {
  return `occurrence-type-summary-${typeId}`
}

type AwaitingCreate = Readonly<{ knownIds: ReadonlySet<string>; name: string }>

/**
 * Spec 247 T7.6 (D4): o cadastro é fire-and-forget e a lista volta por invalidação; o tipo novo é o que
 * aparece com o nome cadastrado e um id que a tela ainda não conhecia. Achado, abre a linha e leva o foco.
 */
export function useOccurrenceTypeJustCreated(
  input: Readonly<{ onCreated: (typeId: string) => void; types: readonly OccurrenceType[] }>,
) {
  const [awaiting, setAwaiting] = useState<AwaitingCreate | null>(null)
  const [createdTypeId, setCreatedTypeId] = useState<string | undefined>(undefined)

  const created =
    awaiting === null
      ? undefined
      : input.types.find((type) => type.name === awaiting.name && !awaiting.knownIds.has(type.id))
  if (awaiting !== null && created !== undefined) {
    setAwaiting(null)
    setCreatedTypeId(created.id)
    input.onCreated(created.id)
  }

  useEffect(() => {
    if (createdTypeId === undefined) return
    const summary = document.getElementById(buildOccurrenceTypeSummaryId(createdTypeId))
    summary?.scrollIntoView({ block: 'nearest' })
    summary?.focus()
  }, [createdTypeId])

  function trackCreate(name: string) {
    setCreatedTypeId(undefined)
    setAwaiting({ knownIds: new Set(input.types.map((type) => type.id)), name: name.trim() })
  }

  function dismiss(typeId: string) {
    if (typeId === createdTypeId) setCreatedTypeId(undefined)
  }

  return { createdTypeId, dismiss, trackCreate }
}
