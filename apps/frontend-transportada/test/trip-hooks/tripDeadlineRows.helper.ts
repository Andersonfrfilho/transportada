/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T2.1: as ações e a seleção mínimas para montar a linha da nota e a lista de paradas sem a viagem
 * inteira. Só o que a linha lê; o resto é dublê vazio.
 */
import type { TripStopDocumentActions } from '../../src/modules/trip/components/TripStopList.component'
import type { TripDocumentSelectionController } from '../../src/modules/trip/hooks/useTripDocumentSelection.hook'

export function buildRowActions(
  options: Readonly<{ openDocumentId?: null | string }> = {},
): TripStopDocumentActions {
  return {
    canFieldDelivery: () => false,
    canFieldOccurrence: () => false,
    canIssueNfse: false,
    canManage: true,
    canReportOnBehalf: false,
    canSeparationOccurrence: true,
    canSubmitCte: false,
    capabilities: { canDocument: () => false, canStop: () => false, canTrip: () => false },
    fiscalReadinessByDocumentId: new Map(),
    isEditable: true,
    onToggleDocument: () => undefined,
    openDocumentId: options.openDocumentId ?? null,
    permissions: [],
    proofBadgesByDocumentId: new Map(),
    renderEvents: () => null,
    renderOccurrences: () => null,
    renderProof: () => null,
  } as unknown as TripStopDocumentActions
}

export function buildSelection(): TripDocumentSelectionController {
  return {
    clear: () => undefined,
    replace: () => undefined,
    selectedIds: new Set<string>(),
    toggle: () => undefined,
    toggleMany: () => undefined,
  } as unknown as TripDocumentSelectionController
}
