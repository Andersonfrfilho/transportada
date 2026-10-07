/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4: as prévias montadas de verdade, com um servidor dublado que aplica as MESMAS regras da API
 * (`cargo-preview-item-action.policy.ts`): confirmar só a sugestão, desvincular age no grupo inteiro,
 * vincular à mão troca a situação. ⚠️ `mock.module` não se desfaz e vale para o processo inteiro: o cliente é
 * trocado **uma vez**, aqui, e cada teste só reconfigura o dublê. Contratantes e notas livres continuam no
 * dublê da Fase 2 (`cargoReceivingHarness.helper.ts`).
 */
import { mock } from 'bun:test'
import { act } from 'react'

import type { CargoPreviewClient } from '@/modules/cargo-receiving/shared/cargoPreviewClient.service'
import type { CargoPreviewTripDrafts } from '@/modules/cargo-receiving/shared/cargoPreviewTripDraft.types'
import type {
  CargoPreviewArrivalProposal,
  CargoPreviewDetail,
  CargoPreviewItem,
  CargoPreviewSummary,
} from '@/modules/cargo-receiving/shared/cargoPreview.types'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import {
  buildPreviewDetail,
  buildPreviewSummary,
  DEFAULT_PREVIEW_ITEMS,
  linkedDocument,
  PREVIEW_ID,
} from '../fixtures/cargoPreview.fixture'
import { DEFAULT_TRIP_DRAFTS } from '../fixtures/cargoPreviewTripDraft.fixture'
import { ALFA_ID, documentIdOf } from '../fixtures/cargoReceiving.fixture'

export type PreviewDoubleCalls = {
  readonly getPreview: { afterRow: string | null; routeName?: string; state?: string }[]
  readonly getTripDrafts: string[]
  readonly itemAction: { action: string; documentId?: string; itemId: string }[]
  readonly listPreviews: { cursor: string | null; filters: Record<string, string> }[]
  readonly propose: string[]
  readonly upload: {
    contractorId: string
    fileName: string
    idempotencyKey: string
    size: number
  }[]
}

export type CargoPreviewDouble = {
  readonly calls: PreviewDoubleCalls
  /** As linhas da prévia aberta: as ações do operador as mudam, como a API. */
  items: CargoPreviewItem[]
  itemsPageSize: number
  /** Fila de falhas: a próxima ação sobre o item rejeita com a primeira. */
  actionFailures: Error[]
  previews: CargoPreviewSummary[]
  proposal: CargoPreviewArrivalProposal
  proposeFailure: Error | undefined
  summary: CargoPreviewSummary
  /** Os rascunhos de viagem (spec 237 T5.2): o que `GET /cargo-previews/:id/trip-drafts` devolve. */
  tripDrafts: CargoPreviewTripDrafts
  tripDraftsFailure: Error | undefined
  uploadFailure: Error | undefined
  uploadIsReplay: boolean
}

export const cargoPreviewFakes: { client: CargoPreviewClient; double: CargoPreviewDouble } = {
  client: undefined as unknown as CargoPreviewClient,
  double: undefined as unknown as CargoPreviewDouble,
}

function recompute(double: CargoPreviewDouble): CargoPreviewDetail {
  return buildPreviewDetail({ ...double.summary, items: double.items })
}

function replaceItems(
  double: CargoPreviewDouble,
  change: (item: CargoPreviewItem) => CargoPreviewItem,
  isTarget: (item: CargoPreviewItem) => boolean,
): readonly string[] {
  const touched: string[] = []
  double.items = double.items.map((item) => {
    if (!isTarget(item)) return item
    touched.push(item.id)
    return change(item)
  })
  return touched
}

function applyAction(
  double: CargoPreviewDouble,
  input: { action: string; documentId?: string; itemId: string },
): readonly string[] {
  const target = double.items.find((item) => item.id === input.itemId)
  if (target === undefined) throw new CargoReceivingRequestError('CARGO_PREVIEW_ITEM_NOT_FOUND')
  if (input.action === 'confirm') {
    const candidate = target.candidateDocumentIds[0]
    if (target.matchState !== 'suggested' || candidate === undefined) {
      throw new CargoReceivingRequestError('CARGO_PREVIEW_ITEM_NOT_SUGGESTED')
    }
    const number = Number(candidate.slice(-12))
    return replaceItems(
      double,
      (item) => ({
        ...item,
        document: linkedDocument(number, item.value ?? '0.00'),
        matchGroupKey: `grupo-${String(item.rowNumber)}`,
        matchState: 'matched',
        matchedBy: 'user',
      }),
      (item) => item.id === target.id,
    )
  }
  if (input.action === 'unlink') {
    const key = target.matchGroupKey
    return replaceItems(
      double,
      (item) => ({ ...item, document: null, matchGroupKey: null, matchState: 'awaiting_xml' }),
      (item) => item.id === target.id || (key !== null && item.matchGroupKey === key),
    )
  }
  const number = Number((input.documentId ?? '').slice(-12))
  return replaceItems(
    double,
    (item) => ({
      ...item,
      document: linkedDocument(number, item.value ?? '0.00'),
      matchGroupKey: `grupo-${String(item.rowNumber)}`,
      matchState: 'matched',
      matchedBy: 'user',
    }),
    (item) => item.id === target.id,
  )
}

function buildClient(double: CargoPreviewDouble): CargoPreviewClient {
  return {
    getPreview: ({ filters }) => {
      double.calls.getPreview.push({ ...filters })
      const detail = recompute(double)
      const after = filters.afterRow === null ? 0 : Number(filters.afterRow)
      const matching = detail.items.items.filter(
        (item) =>
          item.rowNumber > after &&
          (filters.state === undefined || item.matchState === filters.state) &&
          (filters.routeName === undefined || item.routeName === filters.routeName),
      )
      const visible = matching.slice(0, double.itemsPageSize)
      const last = visible.at(-1)
      return Promise.resolve({
        ...detail,
        items: {
          items: visible,
          nextCursor:
            matching.length > visible.length && last !== undefined ? String(last.rowNumber) : null,
        },
      })
    },
    getTripDrafts: (previewId) => {
      double.calls.getTripDrafts.push(previewId)
      if (double.tripDraftsFailure !== undefined) return Promise.reject(double.tripDraftsFailure)
      return Promise.resolve(double.tripDrafts)
    },
    itemAction: (input) => {
      double.calls.itemAction.push({ ...input })
      const failure = double.actionFailures.shift()
      if (failure !== undefined) return Promise.reject(failure)
      return Promise.resolve().then(() => ({
        itemIds: applyAction(double, input),
        outcome: 'changed' as const,
      }))
    },
    listPreviews: ({ cursor, filters }) => {
      double.calls.listPreviews.push({ cursor, filters: { ...filters } })
      const items = double.previews.filter(
        (preview) =>
          (filters.contractorId === undefined || preview.contractorId === filters.contractorId) &&
          (filters.status === undefined || preview.status === filters.status),
      )
      return Promise.resolve({ items, nextCursor: null })
    },
    proposeArrival: (previewId) => {
      double.calls.propose.push(previewId)
      if (double.proposeFailure !== undefined) return Promise.reject(double.proposeFailure)
      return Promise.resolve(double.proposal)
    },
    uploadPreview: ({ idempotencyKey, input }) => {
      double.calls.upload.push({
        contractorId: input.contractorId,
        fileName: input.file.name,
        idempotencyKey,
        size: input.file.size,
      })
      if (double.uploadFailure !== undefined) return Promise.reject(double.uploadFailure)
      return Promise.resolve({
        isReplay: double.uploadIsReplay,
        preview: buildPreviewSummary({
          contractorId: input.contractorId,
          fileName: input.file.name,
          status: 'queued',
        }),
      })
    },
  }
}

export function installCargoPreviewDouble(
  overrides: Partial<CargoPreviewDouble> = {},
): CargoPreviewDouble {
  const items = [...DEFAULT_PREVIEW_ITEMS]
  const double: CargoPreviewDouble = {
    actionFailures: [],
    calls: {
      getPreview: [],
      getTripDrafts: [],
      itemAction: [],
      listPreviews: [],
      propose: [],
      upload: [],
    },
    items,
    itemsPageSize: 100,
    previews: [buildPreviewSummary()],
    proposal: {
      contractorId: ALFA_ID,
      documentIds: [documentIdOf(52_001), documentIdOf(52_006)],
      plannedDate: '2026-10-05',
      previewId: PREVIEW_ID,
      refused: [],
    },
    proposeFailure: undefined,
    summary: buildPreviewSummary(),
    tripDrafts: DEFAULT_TRIP_DRAFTS,
    tripDraftsFailure: undefined,
    uploadFailure: undefined,
    uploadIsReplay: false,
    ...overrides,
  }
  cargoPreviewFakes.double = double
  cargoPreviewFakes.client = buildClient(double)
  return double
}

void mock.module('@/modules/cargo-receiving/shared/cargoPreviewClient.service', () => ({
  getCargoPreviewClient: () => cargoPreviewFakes.client,
}))

/** Dá ao dublê um arquivo escolhido: o `<input type="file">` do navegador não aceita `value`. */
export async function chooseFile(input: HTMLInputElement, file: File): Promise<void> {
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
}

export function sheetFile(input: { bytes?: number; name?: string } = {}): File {
  return new File([new Uint8Array(input.bytes ?? 1_000)], input.name ?? 'FR-05-10.xlsm', {
    lastModified: 1_759_500_000_000,
  })
}
