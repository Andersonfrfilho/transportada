/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.2: os rascunhos de viagem no formato que a API devolve
 * (`apps/api-transportada/src/cargo-receiving/domain/cargo-preview-trip-draft.types.ts`). Dados
 * sintéticos: contratante, destinatários e números inventados; só as cidades são reais.
 */
import type {
  CargoPreviewTripDraftDocument,
  CargoPreviewTripDraftRoute,
  CargoPreviewTripDrafts,
} from '@/modules/cargo-receiving/shared/cargoPreviewTripDraft.types'
import type { CargoPreviewStateCounts } from '@/modules/cargo-receiving/shared/cargoPreview.types'

import { documentIdOf } from './cargoReceiving.fixture'
import { PREVIEW_ID } from './cargoPreview.fixture'

export const TRIP_DRAFT_CONTRACTOR_ID = '00000000-0000-4000-8000-000000237a01'

export function buildCounts(
  overrides: Partial<Record<keyof CargoPreviewStateCounts, number>> = {},
): CargoPreviewStateCounts {
  const counts = {
    ambiguous: 0,
    awaiting_xml: 0,
    invalid: 0,
    matched: 0,
    suggested: 0,
    ...overrides,
  }
  return {
    ...counts,
    total:
      overrides.total ??
      counts.ambiguous + counts.awaiting_xml + counts.invalid + counts.matched + counts.suggested,
  }
}

export function buildDraftDocument(
  number: number,
  overrides: Partial<CargoPreviewTripDraftDocument> = {},
): CargoPreviewTripDraftDocument {
  return {
    cityIbgeCode: '3548906',
    cityName: 'São Carlos',
    documentId: documentIdOf(number),
    isInLiveTrip: false,
    isRoutable: true,
    lineCount: 1,
    number: String(number),
    recipientName: `Mercado Fictício ${String(number)}`,
    series: '1',
    status: 'authorized',
    totalValue: '1500.0000',
    weightKg: '120.000',
    ...overrides,
  }
}

export function buildDraftRoute(
  routeName: string | null,
  overrides: Partial<CargoPreviewTripDraftRoute> = {},
): CargoPreviewTripDraftRoute {
  const documents = overrides.documents ?? []
  const routableDocumentIds =
    overrides.routableDocumentIds ??
    documents.filter((entry) => entry.isRoutable).map((entry) => entry.documentId)
  return {
    canPropose: routableDocumentIds.length > 0,
    cannotProposeReason:
      documents.length === 0
        ? 'no_linked_documents'
        : routableDocumentIds.length === 0
          ? 'none_routable'
          : null,
    cities: [],
    counts: buildCounts({ matched: documents.length }),
    documents,
    linkedTotals: { value: '0.00', weightKg: '0.000' },
    loadOrigin: null,
    loadReference: null,
    missingCount: 0,
    plannedDate: '2026-10-05',
    routableDocumentIds,
    routeName,
    totals: { value: '0.00', volumeM3: null, weightKg: '0.000' },
    ...overrides,
  }
}

/** A mesma conta da API: o resumo sai dos rascunhos, para o fixture nunca discordar de si mesmo. */
export function buildTripDrafts(
  routes: readonly CargoPreviewTripDraftRoute[],
  overrides: Partial<CargoPreviewTripDrafts> = {},
): CargoPreviewTripDrafts {
  const documents = routes.flatMap((route) => route.documents)
  const routable = [...new Set(routes.flatMap((route) => route.routableDocumentIds))]
  const counts = buildCounts(
    Object.fromEntries(
      (['ambiguous', 'awaiting_xml', 'invalid', 'matched', 'suggested'] as const).map((state) => [
        state,
        routes.reduce((sum, route) => sum + route.counts[state], 0),
      ]),
    ),
  )
  return {
    contractorId: TRIP_DRAFT_CONTRACTOR_ID,
    plannedDate: '2026-10-05',
    previewId: PREVIEW_ID,
    routableDocumentIds: routable,
    routes,
    status: 'ready',
    summary: {
      canPropose: routable.length > 0,
      counts,
      inLiveTripDocumentCount: new Set(
        documents.filter((entry) => entry.isInLiveTrip).map((entry) => entry.documentId),
      ).size,
      linkedDocumentCount: new Set(documents.map((entry) => entry.documentId)).size,
      missingCount: counts.awaiting_xml,
      routableDocumentCount: routable.length,
      routeCount: routes.filter((route) => route.routeName !== null).length,
    },
    ...overrides,
  }
}

const SAO_CARLOS_DOCUMENTS = [
  buildDraftDocument(53_001, { lineCount: 2, totalValue: '3000.0000', weightKg: '240.000' }),
  buildDraftDocument(53_002),
  buildDraftDocument(53_003, {
    cityIbgeCode: '3503208',
    cityName: 'Araraquara',
    isInLiveTrip: true,
    isRoutable: false,
  }),
]

/** Quatro roteiros em situações variadas e um grupo "sem roteiro" só com linha inválida. */
export const DEFAULT_TRIP_DRAFTS = buildTripDrafts([
  buildDraftRoute('FR.FRANC', {
    cities: [{ cityIbgeCode: null, cityName: 'FRANCA', documentCount: 0, pendingLineCount: 4 }],
    counts: buildCounts({ awaiting_xml: 4 }),
    missingCount: 4,
    totals: { value: '7210.40', volumeM3: null, weightKg: '512.300' },
  }),
  buildDraftRoute('FR.MATAO', {
    cities: [{ cityIbgeCode: '3529401', cityName: 'Matão', documentCount: 1, pendingLineCount: 1 }],
    counts: buildCounts({ ambiguous: 1, matched: 1 }),
    documents: [
      buildDraftDocument(53_010, { cityName: 'Matão', isInLiveTrip: true, isRoutable: false }),
    ],
    linkedTotals: { value: '1500.0000', weightKg: '120.000' },
    totals: { value: '2940.00', volumeM3: '0.4000', weightKg: '233.500' },
  }),
  buildDraftRoute('FR.R.PRE', {
    cities: [
      { cityIbgeCode: '3538709', cityName: 'Piracicaba', documentCount: 2, pendingLineCount: 0 },
    ],
    counts: buildCounts({ matched: 2 }),
    documents: [
      buildDraftDocument(53_020, { cityIbgeCode: '3538709', cityName: 'Piracicaba' }),
      buildDraftDocument(53_021, { cityIbgeCode: '3538709', cityName: 'Piracicaba' }),
    ],
    linkedTotals: { value: '3000.0000', weightKg: '240.000' },
    loadOrigin: 'totals',
    loadReference: 'CARGA-9002',
    totals: { value: '3000.00', volumeM3: '0.5200', weightKg: '240.000' },
  }),
  buildDraftRoute('FR.S.CAR', {
    cities: [
      { cityIbgeCode: '3503208', cityName: 'Araraquara', documentCount: 1, pendingLineCount: 0 },
      { cityIbgeCode: '3548906', cityName: 'São Carlos', documentCount: 2, pendingLineCount: 2 },
    ],
    counts: buildCounts({ awaiting_xml: 2, matched: 4, suggested: 1 }),
    documents: SAO_CARLOS_DOCUMENTS,
    linkedTotals: { value: '6000.0000', weightKg: '480.000' },
    loadOrigin: 'totals',
    loadReference: 'CARGA-9001',
    missingCount: 2,
    totals: { value: '9100.50', volumeM3: '1.3000', weightKg: '700.500' },
  }),
  buildDraftRoute(null, { counts: buildCounts({ invalid: 1 }) }),
])
