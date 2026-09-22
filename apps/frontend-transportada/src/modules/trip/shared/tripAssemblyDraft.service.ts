/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O rascunho da montagem de viagem, manual e automática, montado a partir do estado da tela.
 * Medir uma caixa, abrir a frota ou recarregar desmonta a tela de viagens, e com ela tudo que
 * estava em `useState` — o operador voltava da medição para um formulário vazio.
 *
 * ⚠️ **Só entradas e ids.** A nota inteira carrega destinatário, endereço e telefone, e a chave de
 * parada carrega CEP e número: nada disso entra. Na volta, a nota é relida da busca pelo id.
 */
import type { RouteChoice } from './routeGeometry.service'
import {
  isAutomaticAssemblyDraft,
  isManualAssemblyDraft,
  type AutomaticAssemblyDraft,
  type ManualAssemblyDraft,
} from './tripAssemblyDraft.validation'
import {
  readTripAssemblyDraft,
  TRIP_ASSEMBLY_DRAFT_MODE,
  writeTripAssemblyDraft,
  clearTripAssemblyDraft,
  type TripAssemblyDraftScope,
  type TripAssemblyDraftStorage,
} from './tripAssemblyDraftStorage.service'
import {
  encodeStopOrder,
  encodeStopOrderByVehicle,
  type StopOrderDocument,
} from './tripAssemblyStopOrder.service'
import { stagedDocuments, type TripQuickCreateQueue } from './tripQuickCreate.service'
import type { TripRouteAssemblyDraft } from './tripRouteAssembly.service'

type StorageInput = Readonly<{
  now: number
  scope: TripAssemblyDraftScope
  storage: TripAssemblyDraftStorage | null
}>

/** A proposta em revisão como a tela a guarda: Maps e Sets, ordens por chave de parada. */
export type AutomaticProposalState = Readonly<{
  draftOrderByVehicle: ReadonlyMap<string, readonly string[]>
  draftStopMoves: ReadonlyMap<string, string>
  openVehicleId: null | string
  orderByVehicle: ReadonlyMap<string, readonly string[]>
  pendingRemovals: ReadonlySet<string>
  releaseLayoutByVehicle: ReadonlyMap<string, string>
  routeChoiceByVehicle: ReadonlyMap<string, RouteChoice>
  selectedVehicleIds: ReadonlySet<string>
  stopMoves: ReadonlyMap<string, string>
  suggestionId: string
}>

function copyRouteChoice(choice: RouteChoice): RouteChoice {
  return { criterion: choice.criterion, signature: choice.signature }
}

export function buildManualAssemblyDraft(
  input: Readonly<{
    cityOrder: readonly string[]
    dailyAllowanceDaysInput: string | undefined
    driverIds: readonly string[]
    isOpen: boolean
    queue: TripQuickCreateQueue
    routeChoice: RouteChoice | undefined
    vehicleId: string
  }>,
): ManualAssemblyDraft {
  const documents = stagedDocuments(input.queue)
  return {
    dailyAllowanceDaysInput: input.dailyAllowanceDaysInput ?? null,
    documentIds: documents.map((document) => document.id),
    driverIds: [...input.driverIds],
    isOpen: input.isOpen,
    routeChoice: input.routeChoice === undefined ? null : copyRouteChoice(input.routeChoice),
    stopOrderDocumentIds: encodeStopOrder({ documents, order: input.cityOrder }),
    vehicleId: input.vehicleId,
  }
}

export function buildAutomaticAssemblyDraft(
  input: Readonly<{
    draft: TripRouteAssemblyDraft
    isOpen: boolean
    pendingSuggestionId: null | string
    pool: readonly StopOrderDocument[]
    proposal: AutomaticProposalState | null
  }>,
): AutomaticAssemblyDraft {
  const { pool, proposal } = input
  return {
    documentIds: pool.map((document) => document.id),
    driverIds: [...input.draft.driverIds],
    isOpen: input.isOpen,
    pendingSuggestionId: input.pendingSuggestionId,
    proposal:
      proposal === null
        ? null
        : {
            draftOrderDocumentIdsByVehicle: encodeStopOrderByVehicle({
              documents: pool,
              orders: proposal.draftOrderByVehicle,
            }),
            draftStopMoves: [...proposal.draftStopMoves],
            openVehicleId: proposal.openVehicleId,
            orderDocumentIdsByVehicle: encodeStopOrderByVehicle({
              documents: pool,
              orders: proposal.orderByVehicle,
            }),
            pendingRemovals: [...proposal.pendingRemovals],
            releaseLayoutByVehicle: [...proposal.releaseLayoutByVehicle],
            routeChoiceByVehicle: [...proposal.routeChoiceByVehicle].map(([vehicleId, choice]) => [
              vehicleId,
              copyRouteChoice(choice),
            ]),
            selectedVehicleIds: [...proposal.selectedVehicleIds],
            stopMoves: [...proposal.stopMoves],
            suggestionId: proposal.suggestionId,
          },
    vehicleIds: [...input.draft.vehicleIds],
  }
}

/** A busca remontada anuncia a mesma seleção em outra ordem — isso não é o operador mexendo. */
export function isSameDocumentSelection(
  left: readonly Readonly<{ id: string }>[],
  right: readonly Readonly<{ id: string }>[],
): boolean {
  if (left.length !== right.length) return false
  const rightIds = new Set(right.map((document) => document.id))
  return left.every((document) => rightIds.has(document.id))
}

/** Sem nota, motorista, veículo nem número digitado não há o que retomar — abrir o diálogo não é rascunho. */
export function isManualAssemblyDraftEmpty(draft: ManualAssemblyDraft): boolean {
  return (
    draft.documentIds.length === 0 &&
    draft.driverIds.length === 0 &&
    draft.vehicleId === '' &&
    (draft.dailyAllowanceDaysInput ?? '') === ''
  )
}

export function isAutomaticAssemblyDraftEmpty(draft: AutomaticAssemblyDraft): boolean {
  return (
    draft.documentIds.length === 0 &&
    draft.driverIds.length === 0 &&
    draft.vehicleIds.length === 0 &&
    draft.pendingSuggestionId === null &&
    draft.proposal === null
  )
}

/** Estado vazio apaga em vez de gravar: rascunho intocado não ocupa a aba. */
export function writeManualAssemblyDraft(
  input: StorageInput & Readonly<{ draft: ManualAssemblyDraft }>,
): boolean {
  const mode = TRIP_ASSEMBLY_DRAFT_MODE.manual
  if (!isManualAssemblyDraftEmpty(input.draft)) return writeTripAssemblyDraft({ ...input, mode })
  clearTripAssemblyDraft({ ...input, mode })
  return true
}

export function writeAutomaticAssemblyDraft(
  input: StorageInput & Readonly<{ draft: AutomaticAssemblyDraft }>,
): boolean {
  const mode = TRIP_ASSEMBLY_DRAFT_MODE.automatic
  if (!isAutomaticAssemblyDraftEmpty(input.draft)) return writeTripAssemblyDraft({ ...input, mode })
  clearTripAssemblyDraft({ ...input, mode })
  return true
}

export function readManualAssemblyDraft(input: StorageInput): ManualAssemblyDraft | undefined {
  return readTripAssemblyDraft({
    ...input,
    isDraft: isManualAssemblyDraft,
    mode: TRIP_ASSEMBLY_DRAFT_MODE.manual,
  })
}

export function readAutomaticAssemblyDraft(
  input: StorageInput,
): AutomaticAssemblyDraft | undefined {
  return readTripAssemblyDraft({
    ...input,
    isDraft: isAutomaticAssemblyDraft,
    mode: TRIP_ASSEMBLY_DRAFT_MODE.automatic,
  })
}
