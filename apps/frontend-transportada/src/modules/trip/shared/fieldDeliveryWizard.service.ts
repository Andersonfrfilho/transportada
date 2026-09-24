/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CanhotoIdentificationResult } from './canhotoIdentification.service'
import type { FieldDeliveryWizardDocument } from './fieldDeliveryDocument.service'

export type { FieldDeliveryWizardDocument } from './fieldDeliveryDocument.service'

/** O que a T12 recebe de volta em `onSubmit` — o envio em si não é desta task. */
export type FieldDeliveryDraft = Readonly<{
  /**
   * Spec 182 RF7/D4: até cinco fotos da carga, reduzidas do mesmo jeito que o canhoto. Sempre
   * presente — lista vazia é o caso comum (nota sem foto de carga).
   */
  cargoImageBlobs: readonly Blob[]
  deliveredAt: string
  documentId: string
  driverId?: string
  imageBlob: Blob
  receiverDocument?: string
  receiverName?: string
}>

/**
 * Achado de revisão (spec 182): antes vivia como `useState` local de `FieldDeliveryReviewStep` —
 * "Tirar outra foto" desmontava o passo e apagava as fotos de carga já adicionadas em silêncio.
 * Mora aqui, no mesmo estado do rascunho da nota, para sobreviver ao retake (que só troca `step`,
 * nunca `currentIndex`) e reaparecer ao reabrir a conferência.
 */
export type FieldDeliveryCargoPhotoDraft = Readonly<{
  id: string
  imageBlob: Blob
  previewUrl: string
}>

export type FieldDeliveryCapturedPhoto = Readonly<{
  identification: CanhotoIdentificationResult
  imageBlob: Blob
  /**
   * Spec 156 T14, ADR-0069 §3 (R2): presente só quando o código de barras falhou e o OCR leu um
   * número com confiança suficiente — mostrado ao lado da nota sugerida, para a pessoa comparar os
   * dois antes de confirmar. Nunca decide sozinho: `identification` já reflete o resultado do
   * casamento (matched/otherSelected/unreadable), e confirmar continua sendo o toque da pessoa.
   */
  ocrSuggestion?: Readonly<{ number: string; series: null | string }>
}>

/** Só os dois status que travam o passo — a ADR-0067 §4 proíbe o assistente decidir sozinho. */
type FieldDeliveryBlockedIdentification = Extract<
  CanhotoIdentificationResult,
  { status: 'notOnTrip' | 'onTripNotSelected' }
>

export type FieldDeliveryWizardStep =
  | Readonly<{ kind: 'capturing' }>
  | Readonly<{ capture: FieldDeliveryCapturedPhoto; kind: 'reviewing' }>
  | Readonly<{ identification: FieldDeliveryBlockedIdentification; kind: 'blocked' }>
  | Readonly<{ kind: 'finished' }>

export type FieldDeliveryWizardState = Readonly<{
  /** Achado de revisão (spec 182): fotos de carga ainda não confirmadas, por `documentId` da nota
   * em revisão — sobrevivem ao "Tirar outra foto" (`retakeRequested`). */
  cargoPhotosByDocumentId: Readonly<Record<string, readonly FieldDeliveryCargoPhotoDraft[]>>
  currentIndex: number
  documents: readonly FieldDeliveryWizardDocument[]
  drafts: Readonly<Record<string, FieldDeliveryDraft>>
  skippedDocumentIds: readonly string[]
  step: FieldDeliveryWizardStep
}>

export type FieldDeliveryWizardAction =
  | Readonly<{ documentId: string; kind: 'cargoPhotoRemoved'; photoId: string }>
  | Readonly<{
      documentId: string
      kind: 'cargoPhotosAdded'
      photos: readonly FieldDeliveryCargoPhotoDraft[]
    }>
  | Readonly<{ capture: FieldDeliveryCapturedPhoto; kind: 'photoCaptured' }>
  | Readonly<{ draft: FieldDeliveryDraft; kind: 'confirmRequested' }>
  | Readonly<{ kind: 'previousRequested' }>
  | Readonly<{ kind: 'retakeRequested' }>
  | Readonly<{ kind: 'skipRequested' }>

function isBlockedIdentification(
  identification: CanhotoIdentificationResult,
): identification is FieldDeliveryBlockedIdentification {
  return identification.status === 'notOnTrip' || identification.status === 'onTripNotSelected'
}

function stepAtIndex(
  documents: readonly FieldDeliveryWizardDocument[],
  index: number,
): FieldDeliveryWizardStep {
  return index >= documents.length ? { kind: 'finished' } : { kind: 'capturing' }
}

function isDocumentDone(
  state: Pick<FieldDeliveryWizardState, 'drafts' | 'skippedDocumentIds'>,
  documentId: string,
): boolean {
  return documentId in state.drafts || state.skippedDocumentIds.includes(documentId)
}

/** Pula os passos já decididos (rascunho gravado ou pulado) — nunca reaparecem sozinhos. */
function firstUndoneIndex(
  state: Pick<FieldDeliveryWizardState, 'documents' | 'drafts' | 'skippedDocumentIds'>,
  fromIndex: number,
): number {
  for (let index = fromIndex; index < state.documents.length; index += 1) {
    const document = state.documents[index]
    if (document !== undefined && !isDocumentDone(state, document.documentId)) return index
  }
  return state.documents.length
}

export function createInitialFieldDeliveryWizardState(
  documents: readonly FieldDeliveryWizardDocument[],
): FieldDeliveryWizardState {
  return {
    cargoPhotosByDocumentId: {},
    currentIndex: 0,
    documents,
    drafts: {},
    skippedDocumentIds: [],
    step: stepAtIndex(documents, 0),
  }
}

export function currentFieldDeliveryDocument(
  state: FieldDeliveryWizardState,
): FieldDeliveryWizardDocument | undefined {
  return state.documents[state.currentIndex]
}

export function isFieldDeliveryWizardFinished(state: FieldDeliveryWizardState): boolean {
  return state.step.kind === 'finished'
}

/** Ordem dos documentos originais, não a ordem em que foram confirmados. */
export function collectFieldDeliveryDrafts(
  state: FieldDeliveryWizardState,
): readonly FieldDeliveryDraft[] {
  return state.documents.flatMap((document) => {
    const draft = state.drafts[document.documentId]
    return draft === undefined ? [] : [draft]
  })
}

/**
 * Spec 156 T11 (D5, D6, aceite 5/6/7): a máquina do assistente é pura — nenhuma câmera, nenhuma
 * chamada de rede. `photoCaptured` só decide se a foto **bloqueia** (fora da viagem, ou da viagem
 * mas fora do lote marcado) ou segue para a conferência; quem confirma é sempre a pessoa
 * (ADR-0067 §4), nunca a classificação sozinha.
 *
 * "Trocar pela identificação": `confirmRequested` aceita um `draft.documentId` diferente do
 * documento esperado no passo atual (`otherSelected`) — a foto vale para a nota que a câmera leu,
 * e a nota esperada volta para a fila de pendentes (marcada aqui como pulada) em vez de travar o
 * assistente. Decisão registrada no `evidence.md` da T11: retomar essa nota específica depois é
 * "voltar" ou uma nova rodada, não algo que esta máquina resolve sozinha.
 */
export function fieldDeliveryWizardReducer(
  state: FieldDeliveryWizardState,
  action: FieldDeliveryWizardAction,
): FieldDeliveryWizardState {
  switch (action.kind) {
    case 'cargoPhotosAdded': {
      const existing = state.cargoPhotosByDocumentId[action.documentId] ?? []
      return {
        ...state,
        cargoPhotosByDocumentId: {
          ...state.cargoPhotosByDocumentId,
          [action.documentId]: [...existing, ...action.photos],
        },
      }
    }

    case 'cargoPhotoRemoved': {
      const existing = state.cargoPhotosByDocumentId[action.documentId] ?? []
      return {
        ...state,
        cargoPhotosByDocumentId: {
          ...state.cargoPhotosByDocumentId,
          [action.documentId]: existing.filter((photo) => photo.id !== action.photoId),
        },
      }
    }

    case 'photoCaptured': {
      const { identification } = action.capture
      if (isBlockedIdentification(identification)) {
        return { ...state, step: { identification, kind: 'blocked' } }
      }
      return { ...state, step: { capture: action.capture, kind: 'reviewing' } }
    }

    case 'retakeRequested':
      return { ...state, step: { kind: 'capturing' } }

    case 'previousRequested': {
      const currentIndex = Math.max(0, state.currentIndex - 1)
      return { ...state, currentIndex, step: { kind: 'capturing' } }
    }

    case 'skipRequested': {
      const current = currentFieldDeliveryDocument(state)
      if (current === undefined) return state
      const skippedDocumentIds = state.skippedDocumentIds.includes(current.documentId)
        ? state.skippedDocumentIds
        : [...state.skippedDocumentIds, current.documentId]
      /**
       * M13b (spec 156 T15): "Pular" tem de valer mesmo depois de "Voltar" para uma nota já
       * confirmada — sem isto, o rascunho antigo sobrevivia em `drafts` e ia junto no envio, contra
       * a decisão que a pessoa acabou de tomar na tela.
       */
      const drafts = { ...state.drafts }
      delete drafts[current.documentId]
      const partial = { ...state, drafts, skippedDocumentIds }
      const currentIndex = firstUndoneIndex(partial, state.currentIndex + 1)
      return { ...partial, currentIndex, step: stepAtIndex(state.documents, currentIndex) }
    }

    case 'confirmRequested': {
      const current = currentFieldDeliveryDocument(state)
      const drafts = { ...state.drafts, [action.draft.documentId]: action.draft }
      const isSwap = current !== undefined && current.documentId !== action.draft.documentId
      const skippedDocumentIds =
        isSwap && current !== undefined && !state.skippedDocumentIds.includes(current.documentId)
          ? [...state.skippedDocumentIds, current.documentId]
          : state.skippedDocumentIds
      /** Achado de revisão (spec 182): as fotos de carga já foram para `draft.cargoImageBlobs` —
       * a entrada do rascunho local não serve mais (quem revoga os object URLs é o componente). */
      const cargoPhotosByDocumentId = { ...state.cargoPhotosByDocumentId }
      if (current !== undefined) delete cargoPhotosByDocumentId[current.documentId]
      const partial = { ...state, cargoPhotosByDocumentId, drafts, skippedDocumentIds }
      const currentIndex = firstUndoneIndex(partial, state.currentIndex + 1)
      return { ...partial, currentIndex, step: stepAtIndex(state.documents, currentIndex) }
    }

    default:
      return state
  }
}
