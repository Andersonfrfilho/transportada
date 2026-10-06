/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CARGO_TRIP_DRAFT_OPEN_VALUE,
  CARGO_TRIP_DRAFT_OUTSIDE_KINDS,
  CARGO_TRIP_DRAFT_SOLVER_DOCUMENT_LIMIT,
  CARGO_TRIP_DRAFT_URL_PARAMETERS,
} from './cargoPreviewTripDraft.constant'
import type {
  CargoPreviewTripDraftRoute,
  CargoPreviewTripDrafts,
  CargoTripDraftCannotProposeReason,
} from './cargoPreviewTripDraft.types'
import type { CargoPreviewItemState } from './cargoPreview.types'

/** Ao fluxo de criação de viagem vão SÓ as notas roteáveis do roteiro — e só elas, nunca a linha que espera o XML. */
export function resolveTripDraftCreationIds(route: CargoPreviewTripDraftRoute): readonly string[] {
  return route.routableDocumentIds
}

export type CargoTripDraftSolverScope = Readonly<{
  documentIds: readonly string[]
  /** Acima do teto o roteirizador recusaria o pedido: a tela pede para escolher um roteiro. */
  isOverLimit: boolean
  routeName: string | undefined
}>

/**
 * O que o roteirizador recebe: todas as notas roteáveis, ou só as do roteiro escolhido. Roteiro que sumiu da
 * prévia (URL antiga) não vira escopo vazio — volta a valer "todos".
 */
export function resolveTripDraftSolverScope(
  input: Readonly<{ drafts: CargoPreviewTripDrafts; selectedRouteName: string | undefined }>,
): CargoTripDraftSolverScope {
  const route =
    input.selectedRouteName === undefined
      ? undefined
      : input.drafts.routes.find((entry) => entry.routeName === input.selectedRouteName)
  const documentIds =
    route === undefined ? input.drafts.routableDocumentIds : route.routableDocumentIds
  return {
    documentIds,
    isOverLimit: documentIds.length > CARGO_TRIP_DRAFT_SOLVER_DOCUMENT_LIMIT,
    routeName: route?.routeName ?? undefined,
  }
}

export type CargoTripDraftAction =
  | Readonly<{ kind: 'disabled'; reason: CargoTripDraftCannotProposeReason }>
  | Readonly<{ kind: 'enabled' | 'hidden' }>

/** Quem só lê não vê ação nenhuma; quem pode agir vê o botão e, sem nota roteável, o motivo de ele estar desligado. */
export function resolveTripDraftAction(
  input: Readonly<{ canManage: boolean; route: CargoPreviewTripDraftRoute }>,
): CargoTripDraftAction {
  if (!input.canManage) return { kind: 'hidden' }
  if (input.route.canPropose) return { kind: 'enabled' }
  return { kind: 'disabled', reason: input.route.cannotProposeReason ?? 'no_linked_documents' }
}

export type CargoTripDraftOutsideKind = (typeof CARGO_TRIP_DRAFT_OUTSIDE_KINDS)[number]

export type CargoTripDraftOutsideEntry = Readonly<{
  count: number
  kind: CargoTripDraftOutsideKind
  /** O filtro do detalhe a que o atalho leva. */
  state: CargoPreviewItemState
}>

function countOf(drafts: CargoPreviewTripDrafts, kind: CargoTripDraftOutsideKind): number {
  if (kind === 'in_live_trip') return drafts.summary.inLiveTripDocumentCount
  return drafts.summary.counts[kind]
}

/** As notas que a recomendação deixa de fora, por motivo — só entra o motivo que tem alguma. */
export function describeTripDraftOutside(
  drafts: CargoPreviewTripDrafts,
): Readonly<{ entries: readonly CargoTripDraftOutsideEntry[]; hasAny: boolean }> {
  const entries = CARGO_TRIP_DRAFT_OUTSIDE_KINDS.map((kind) => ({
    count: countOf(drafts, kind),
    kind,
    state: kind === 'in_live_trip' ? ('matched' as const) : kind,
  })).filter((entry) => entry.count > 0)
  return { entries, hasAny: entries.length > 0 }
}

export type CargoTripDraftView = Readonly<{ isOpen: boolean; routeName: string | undefined }>

/** URL inventada não quebra: o roteiro escolhido só vale com a recomendação aberta. */
export function parseTripDraftView(search: string): CargoTripDraftView {
  const parameters = new URLSearchParams(search)
  const isOpen =
    parameters.get(CARGO_TRIP_DRAFT_URL_PARAMETERS.open) === CARGO_TRIP_DRAFT_OPEN_VALUE
  const routeName = parameters.get(CARGO_TRIP_DRAFT_URL_PARAMETERS.routeName)
  return {
    isOpen,
    routeName: isOpen && routeName !== null && routeName !== '' ? routeName : undefined,
  }
}

export function serializeTripDraftView(
  input: Readonly<{ search: string; view: CargoTripDraftView }>,
): string {
  const parameters = new URLSearchParams(input.search)
  parameters.delete(CARGO_TRIP_DRAFT_URL_PARAMETERS.open)
  parameters.delete(CARGO_TRIP_DRAFT_URL_PARAMETERS.routeName)
  if (input.view.isOpen) {
    parameters.set(CARGO_TRIP_DRAFT_URL_PARAMETERS.open, CARGO_TRIP_DRAFT_OPEN_VALUE)
    if (input.view.routeName !== undefined) {
      parameters.set(CARGO_TRIP_DRAFT_URL_PARAMETERS.routeName, input.view.routeName)
    }
  }
  const serialized = parameters.toString()
  return serialized === '' ? '' : `?${serialized}`
}
