/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O valor de hoje dos campos de exigência do tipo (spec 246): é o que o painel lê de uma API
 * anterior aos campos, e o que os fixtures de `OccurrenceType` herdam para não repeti-lo.
 */
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'

export const OCCURRENCE_REQUIREMENT_DEFAULTS = {
  itemsMinimumCount: null,
  noteMode: 'optional',
  photoMinimumCount: 1,
  signatureMode: 'off',
} as const satisfies Pick<
  OccurrenceType,
  'itemsMinimumCount' | 'noteMode' | 'photoMinimumCount' | 'signatureMode'
>
