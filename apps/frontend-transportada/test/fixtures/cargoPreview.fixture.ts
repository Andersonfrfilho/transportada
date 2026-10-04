/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4: a prévia de carga no formato que a API devolve (`apps/api-transportada/src/cargo-receiving`,
 * arquivos `cargo-preview*`). Dados sintéticos: contratantes, destinatários, endereços e CEPs inventados;
 * só as cidades são reais.
 */
import type {
  CargoPreviewDetail,
  CargoPreviewItem,
  CargoPreviewItemState,
  CargoPreviewRouteGroup,
  CargoPreviewStateCounts,
  CargoPreviewSummary,
} from '@/modules/cargo-receiving/shared/cargoPreview.types'

import { ALFA_ID, documentIdOf } from './cargoReceiving.fixture'

export const PREVIEW_ID = '00000000-0000-4000-8000-0000002374a1'
export const PREVIEW_SECOND_ID = '00000000-0000-4000-8000-0000002374a2'
export const PREVIEW_THIRD_ID = '00000000-0000-4000-8000-0000002374a3'

export function itemIdOf(row: number): string {
  return `00000000-0000-4000-8000-0000002375${String(row).padStart(2, '0')}`
}

export function buildPreviewSummary(
  overrides: Partial<CargoPreviewSummary> = {},
): CargoPreviewSummary {
  return {
    arrivalId: null,
    contractorId: ALFA_ID,
    contractorName: 'Alfa Indústria Fictícia',
    createdAt: '2026-10-03T14:06:00.000Z',
    errorCode: null,
    fileName: 'FR-05-10.xlsm',
    fileSha256: 'a'.repeat(64),
    fileSizeBytes: 820_000,
    id: PREVIEW_ID,
    plannedDate: '2026-10-05',
    receivedAt: '2026-10-03T14:06:00.000Z',
    rowCount: 7,
    sheetName: 'IMPORTAÇÃO',
    source: 'upload',
    status: 'ready',
    updatedAt: '2026-10-03T14:07:00.000Z',
    ...overrides,
  }
}

export function buildPreviewItem(
  row: number,
  overrides: Partial<CargoPreviewItem> = {},
): CargoPreviewItem {
  return {
    address: `RUA DAS FLORES FICTICIA ${String(row)}`,
    candidateDocumentIds: [],
    city: 'PIRACICABA',
    contractorReference: String(815_000 + row),
    document: null,
    evidence: [],
    id: itemIdOf(row),
    matchGroupKey: null,
    matchState: 'awaiting_xml',
    matchedAt: null,
    matchedBy: null,
    neighborhood: 'CENTRO',
    postalCode: '13400000',
    recipientCode: String(42_000 + row),
    recipientName: `MERCADO FICTICIO ${String(row)} LTDA`,
    routeName: 'FR.S.CAR',
    routingDate: '2026-10-03',
    rowErrors: [],
    rowNumber: row + 4,
    state: 'SP',
    value: `${String(1000 + row * 111)}.50`,
    volumeM3: '0.26',
    weightKg: '138.70',
    ...overrides,
  }
}

export function linkedDocument(number: number, value: string) {
  return {
    id: documentIdOf(number),
    importedAt: '2026-10-03T22:30:00.000Z',
    issuedAt: '2026-10-03T21:10:00.000Z',
    number: String(number),
    recipientName: `Mercado Fictício ${String(number)}`,
    series: '1',
    totalValue: value,
  }
}

/** Uma prévia de seis linhas, uma de cada situação (e uma ligada pelo operador). */
export const DEFAULT_PREVIEW_ITEMS: readonly CargoPreviewItem[] = [
  buildPreviewItem(1, {
    document: linkedDocument(52_001, '1111.50'),
    evidence: ['value', 'weight', 'route_load'],
    matchGroupKey: 'grupo-1',
    matchState: 'matched',
    matchedAt: '2026-10-03T22:31:00.000Z',
    matchedBy: 'system',
  }),
  buildPreviewItem(2),
  buildPreviewItem(3, {
    candidateDocumentIds: [documentIdOf(52_003)],
    evidence: ['value'],
    matchState: 'suggested',
  }),
  buildPreviewItem(4, {
    candidateDocumentIds: [documentIdOf(52_004), documentIdOf(52_005)],
    city: 'LIMEIRA',
    matchState: 'ambiguous',
    routeName: 'FR.R.LIM',
  }),
  buildPreviewItem(5, {
    city: 'LIMEIRA',
    matchState: 'invalid',
    routeName: 'FR.R.LIM',
    rowErrors: [
      { column: 'VALOR', field: 'value', message: 'Must be a non-negative decimal number' },
      { column: 'PESO TOTAL', field: 'weightKg', message: 'A value is required' },
    ],
    value: null,
    weightKg: null,
  }),
  buildPreviewItem(6, {
    document: linkedDocument(52_006, '1666.50'),
    matchGroupKey: 'grupo-6',
    matchState: 'matched',
    matchedAt: '2026-10-03T22:40:00.000Z',
    matchedBy: 'user',
    routeName: 'FR.R.LIM',
  }),
  buildPreviewItem(7, { city: null, routeName: null }),
]

export function countPreviewItems(items: readonly CargoPreviewItem[]): CargoPreviewStateCounts {
  const counts: Record<CargoPreviewItemState | 'total', number> = {
    ambiguous: 0,
    awaiting_xml: 0,
    invalid: 0,
    matched: 0,
    suggested: 0,
    total: items.length,
  }
  for (const item of items) counts[item.matchState] += 1
  return counts
}

export function buildRouteGroups(
  items: readonly CargoPreviewItem[],
): readonly CargoPreviewRouteGroup[] {
  const names = [
    ...new Set(items.flatMap((item) => (item.routeName === null ? [] : [item.routeName]))),
  ]
  return names.sort().map((routeName) => ({
    counts: countPreviewItems(items.filter((item) => item.routeName === routeName)),
    loadOrigin: routeName === 'FR.S.CAR' ? 'totals' : null,
    loadReference: routeName === 'FR.S.CAR' ? 'CARGA-9001' : null,
    routeName,
  }))
}

export function buildPreviewDetail(
  overrides: Partial<CargoPreviewSummary> & {
    items?: readonly CargoPreviewItem[]
    nextCursor?: string | null
  } = {},
): CargoPreviewDetail {
  const { items = DEFAULT_PREVIEW_ITEMS, nextCursor = null, ...summary } = overrides
  return {
    ...buildPreviewSummary({ rowCount: items.length, ...summary }),
    counts: countPreviewItems(items),
    items: { items, nextCursor },
    routes: buildRouteGroups(items),
  }
}
