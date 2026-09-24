/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 185 (RF1, ADR-0074): a conta de "carga fechada" é uma função pura só, usada pelo despacho
 * automático e pelo botão "Despachar". Quem lê o banco resolve `leavesBehindOccurrenceTypeName`
 * (ocorrência aberta de separação, sobre a nota inteira, de tipo com `leaves_document_behind`).
 */
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'

export type DispatchReadinessDocument = {
  readonly tripDocumentId: string
  readonly separationStatus: TripDocumentSeparationStatus
  readonly isReleased: boolean
  readonly leavesBehindOccurrenceTypeName: string | null
}

export type ResolveDispatchReadinessParams = {
  readonly documents: readonly DispatchReadinessDocument[]
}

export type ResolveDispatchReadinessResult = {
  readonly isCargoClosed: boolean
  readonly leftBehind: readonly {
    readonly tripDocumentId: string
    readonly occurrenceTypeName: string
  }[]
  readonly toLoad: readonly {
    readonly tripDocumentId: string
    readonly separationStatus: 'pending' | 'separated'
  }[]
}

function isAlive(document: DispatchReadinessDocument): boolean {
  return !document.isReleased && document.separationStatus !== 'returned'
}

function isLoadedOrDelivered(document: DispatchReadinessDocument): boolean {
  return document.separationStatus === 'loaded' || document.separationStatus === 'delivered'
}

/**
 * ⚠️ Viagem só com notas deixadas para trás, ou vazia, **não** fecha — a conta exige ao menos uma
 * nota viva carregada, senão despachar seria enganoso (spec 185, "casos extremos e falhas").
 */
export function resolveDispatchReadiness(
  params: ResolveDispatchReadinessParams,
): ResolveDispatchReadinessResult {
  const alive = params.documents.filter(isAlive)

  const leftBehind = alive
    .filter(
      (document) =>
        !isLoadedOrDelivered(document) && document.leavesBehindOccurrenceTypeName !== null,
    )
    .map((document) => ({
      tripDocumentId: document.tripDocumentId,
      occurrenceTypeName: document.leavesBehindOccurrenceTypeName as string,
    }))

  const toLoad = alive
    .filter(
      (document) =>
        !isLoadedOrDelivered(document) && document.leavesBehindOccurrenceTypeName === null,
    )
    .map((document) => ({
      tripDocumentId: document.tripDocumentId,
      separationStatus: document.separationStatus as 'pending' | 'separated',
    }))

  const loadedCount = alive.filter(isLoadedOrDelivered).length
  const isCargoClosed = toLoad.length === 0 && loadedCount >= 1

  return { isCargoClosed, leftBehind, toLoad }
}
