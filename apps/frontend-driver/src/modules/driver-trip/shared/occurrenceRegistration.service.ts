/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverOccurrenceFlow,
  DriverOccurrencePhoto,
  DriverOccurrenceType,
  DriverTripDocument,
  ProofFieldRequirement,
} from './driverTrip.types'
import {
  listMissingProofFields,
  resolveProofFormPlan,
  type ProofFieldKey,
} from './proofFormPlan.service'

/**
 * Spec 218 (RF-A5, D1–D4): o botão único de ocorrência. A lista tem todos os tipos do catálogo,
 * de nota e de parada juntos; o motorista escolhe o tipo, e o `flow` dele decide a rota — nunca o
 * motorista. `attachmentMode` e `flow` chegam resolvidos pelo servidor: aqui só se lê.
 */

/** Ausente é a cópia guardada antes da spec 218, quando todo tipo era de nota. */
export function resolveOccurrenceFlow(type: DriverOccurrenceType): DriverOccurrenceFlow {
  return type.flow ?? 'document'
}

/** Ausente é a API anterior à 179 — sem foto, como era. */
export function resolveOccurrenceAttachmentMode(type: DriverOccurrenceType): ProofFieldRequirement {
  return type.attachmentMode ?? 'off'
}

/**
 * Spec 218 RF-B2 (follow-up, substitui a spec 219): a lista final para o formulário do botão
 * único — os tipos de nota já resolvidos para **este** documento (contratante/destinatário do
 * emitente), mais os de parada da viagem inteira, que não têm um contratante/destinatário só para
 * resolver contra e continuam sem exceção. `document.occurrenceTypes === null` é cache antigo ou
 * falha na resolução do servidor — cai na lista da viagem inteira sem exceção, o comportamento de
 * antes da spec 218.
 *
 * ⚠️ A spec 219 resolvia isso mandando `contractorId`/`recipientTaxId` (CPF/CNPJ do destinatário)
 * como query string numa chamada à parte — violava security.md §3 ("nunca dado pessoal em URL").
 * Esta função lê o resultado já resolvido no servidor, embutido no snapshot; nenhum identificador
 * cru sai do aparelho.
 */
export function resolveOccurrenceTypesForDocument(input: {
  readonly document: DriverTripDocument
  readonly tripWideTypes: readonly DriverOccurrenceType[]
}): readonly DriverOccurrenceType[] {
  if (input.document.occurrenceTypes === null) return input.tripWideTypes
  return [
    ...input.document.occurrenceTypes,
    ...input.tripWideTypes.filter((type) => resolveOccurrenceFlow(type) === 'stop'),
  ]
}

/**
 * O mesmo veredito do comprovante (`listMissingProofFields`), com um plano de um campo só: a foto,
 * no `attachmentMode` do tipo. A regra de "obrigatório falta" é uma só no app.
 */
export function listMissingOccurrenceFields(input: {
  readonly hasPhoto: boolean
  readonly type: DriverOccurrenceType
}): readonly ProofFieldKey[] {
  const plan = resolveProofFormPlan({
    cargo: 'off',
    cargoMinimumCount: 1,
    photo: resolveOccurrenceAttachmentMode(input.type),
    receivedBy: 'off',
    receiverDocument: 'off',
    receiverName: 'off',
    signature: 'off',
  })
  return listMissingProofFields({
    plan,
    values: {
      cargoCount: 0,
      hasPhoto: input.hasPhoto,
      hasSignature: false,
      receiverDocument: '',
      receiverName: '',
    },
  })
}

/**
 * P5: "Registrar" habilita com a foto **capturada no aparelho** — nada aqui espera upload. A foto
 * ainda sendo reduzida segura o botão: registrar sem ela a deixaria para trás.
 */
export function canRegisterOccurrence(input: {
  readonly hasPhoto: boolean
  readonly isPhotoReading: boolean
  readonly type: DriverOccurrenceType | undefined
}): boolean {
  if (input.type === undefined || input.isPhotoReading) return false
  return listMissingOccurrenceFields({ hasPhoto: input.hasPhoto, type: input.type }).length === 0
}

export type OccurrenceRegistrationDraft = Readonly<{
  description: string
  photo: DriverOccurrencePhoto | undefined
}>

/** As duas rotas que existem — o formulário único só escolhe uma delas. */
export type OccurrenceRegistrationHandlers = Readonly<{
  /**
   * D3 + spec 226: nota com ou sem foto — o item `documentOccurrence` da fila, que sobe a foto antes
   * do registro quando há uma. Sem foto o item vai com `photo: null`, e o texto digitado sobrevive
   * à falta de rede.
   */
  enqueueDocumentOccurrence: (input: {
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly occurrenceTypeName: string
    readonly photo: DriverOccurrencePhoto | null
  }) => void
  /** Spec 209 + D2: a fila da parada, com o tipo do catálogo. */
  reportStopOccurrence: (input: {
    readonly description: string
    /** Foto obrigatória nunca é derrubada pela fila cheia — ou entra com ela, ou não entra. */
    readonly isPhotoRequired: boolean
    readonly occurrenceTypeId: string
    readonly photo: DriverOccurrencePhoto | undefined
    readonly stopId: string
  }) => void
}>

export type OccurrenceRegistrationRoute = 'document-queued' | 'stop'

/**
 * Uma rota só, a do `flow`. D4: tipo de parada registra **na parada** — a nota é só de onde veio o
 * toque, e não vai junto.
 */
export function dispatchOccurrenceRegistration(input: {
  readonly documentId: string
  readonly draft: OccurrenceRegistrationDraft
  readonly handlers: OccurrenceRegistrationHandlers
  readonly stopId: string
  readonly type: DriverOccurrenceType
}): OccurrenceRegistrationRoute {
  const { draft, handlers, type } = input
  const note = draft.description.trim()

  if (resolveOccurrenceFlow(type) === 'stop') {
    handlers.reportStopOccurrence({
      description: note,
      isPhotoRequired: resolveOccurrenceAttachmentMode(type) === 'required',
      occurrenceTypeId: type.id,
      photo: draft.photo,
      stopId: input.stopId,
    })
    return 'stop'
  }

  handlers.enqueueDocumentOccurrence({
    documentId: input.documentId,
    note,
    occurrenceTypeId: type.id,
    occurrenceTypeName: type.name,
    photo: draft.photo ?? null,
  })
  return 'document-queued'
}
