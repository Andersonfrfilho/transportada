/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A volta à tela de viagens: o rascunho guardou ids, e o mundo andou enquanto o operador media as
 * caixas. A nota é relida da busca de notas disponíveis — a que virou viagem não volta, e é
 * **contada** para a tela dizer quantas saíram. Motorista e veículo que deixaram de ser
 * selecionáveis saem calados: o campo vazio já pede a escolha de novo.
 *
 * ⚠️ A proposta mora no servidor. Ela é relida (`ready`), nunca recalculada: rodar o roteirizador de
 * novo na volta criaria outra sugestão para as mesmas notas. E falha de rede não é veredito: a
 * proposta fica guardada para outra tentativa, em vez de sumir calada.
 */
import type { RouteChoice } from './routeGeometry.service'
import type { AutomaticAssemblyDraft, ManualAssemblyDraft } from './tripAssemblyDraft.validation'
import { decodeStopOrder, type StopOrderDocument } from './tripAssemblyStopOrder.service'
import {
  keepSelectable,
  restoreSuggestion,
  type SuggestionReaders,
  type SuggestionRestoration,
} from './tripAssemblySuggestionRestore.service'

export type {
  RetainedSuggestion,
  SuggestionRestoration,
} from './tripAssemblySuggestionRestore.service'

/**
 * A busca de notas não respondeu: nada é aplicado e nada é contado. ⚠️ Contar as notas como "viraram
 * viagem" seria aviso falso, e aplicar o formulário sem elas gravaria por cima do rascunho — ele
 * fica guardado até a volta conseguir reler.
 */
export const DRAFT_DOCUMENTS_UNREACHABLE = 'documents-unreachable' as const

type RestorableDocument = StopOrderDocument & Readonly<{ tripId: null | string }>

type SelectableInput = Readonly<{
  selectableDriverIds: readonly string[]
  selectableVehicleIds: readonly string[]
}>

type DocumentRestoration<TDocument> = Readonly<{
  documents: readonly TDocument[]
  droppedDocumentCount: number
}>

export type ManualAssemblyRestoration<TDocument> = DocumentRestoration<TDocument> &
  Readonly<{
    cityOrder: readonly string[]
    dailyAllowanceDaysInput: string | undefined
    driverIds: readonly string[]
    isOpen: boolean
    routeChoice: RouteChoice | undefined
    vehicleId: string
  }>

export type AutomaticAssemblyRestoration<TDocument, TProposal> = DocumentRestoration<TDocument> &
  Readonly<{
    driverIds: readonly string[]
    isOpen: boolean
    suggestion: SuggestionRestoration<TProposal>
    vehicleIds: readonly string[]
  }>

/** `undefined` quando a busca falhou — a volta fica pendente em vez de contar notas perdidas. */
async function restoreDocuments<TDocument extends RestorableDocument>(
  input: Readonly<{
    documentIds: readonly string[]
    loadDocuments: () => Promise<readonly TDocument[]>
  }>,
): Promise<DocumentRestoration<TDocument> | undefined> {
  if (input.documentIds.length === 0) return { documents: [], droppedDocumentCount: 0 }
  let available: readonly TDocument[]
  try {
    available = await input.loadDocuments()
  } catch {
    return undefined
  }
  const byId = new Map(
    available
      .filter((document) => document.tripId === null)
      .map((document) => [document.id, document]),
  )
  const documents = input.documentIds.flatMap((id) => {
    const document = byId.get(id)
    return document === undefined ? [] : [document]
  })
  return { documents, droppedDocumentCount: input.documentIds.length - documents.length }
}

export async function restoreManualAssemblyDraft<TDocument extends RestorableDocument>(
  input: SelectableInput &
    Readonly<{ draft: ManualAssemblyDraft; loadDocuments: () => Promise<readonly TDocument[]> }>,
): Promise<ManualAssemblyRestoration<TDocument> | typeof DRAFT_DOCUMENTS_UNREACHABLE> {
  const { draft } = input
  const restored = await restoreDocuments({
    documentIds: draft.documentIds,
    loadDocuments: input.loadDocuments,
  })
  if (restored === undefined) return DRAFT_DOCUMENTS_UNREACHABLE
  return {
    ...restored,
    cityOrder: decodeStopOrder({
      documentIds: draft.stopOrderDocumentIds,
      documents: restored.documents,
    }),
    dailyAllowanceDaysInput: draft.dailyAllowanceDaysInput ?? undefined,
    driverIds: keepSelectable(draft.driverIds, input.selectableDriverIds),
    isOpen: draft.isOpen,
    routeChoice: draft.routeChoice ?? undefined,
    vehicleId: input.selectableVehicleIds.includes(draft.vehicleId) ? draft.vehicleId : '',
  }
}

export async function restoreAutomaticAssemblyDraft<
  TDocument extends RestorableDocument,
  TProposal,
>(
  input: SelectableInput &
    SuggestionReaders<TProposal> &
    Readonly<{
      draft: AutomaticAssemblyDraft
      loadDocuments: () => Promise<readonly TDocument[]>
    }>,
): Promise<
  AutomaticAssemblyRestoration<TDocument, TProposal> | typeof DRAFT_DOCUMENTS_UNREACHABLE
> {
  const { draft } = input
  const restored = await restoreDocuments({
    documentIds: draft.documentIds,
    loadDocuments: input.loadDocuments,
  })
  if (restored === undefined) return DRAFT_DOCUMENTS_UNREACHABLE
  const suggestion = await restoreSuggestion({
    documents: restored.documents,
    readProposal: input.readProposal,
    readSuggestionStatus: input.readSuggestionStatus,
    retained: { pendingSuggestionId: draft.pendingSuggestionId, proposal: draft.proposal },
    selectableVehicleIds: input.selectableVehicleIds,
  })
  return {
    ...restored,
    driverIds: keepSelectable(draft.driverIds, input.selectableDriverIds),
    isOpen: draft.isOpen,
    suggestion,
    vehicleIds: keepSelectable(draft.vehicleIds, input.selectableVehicleIds),
  }
}
