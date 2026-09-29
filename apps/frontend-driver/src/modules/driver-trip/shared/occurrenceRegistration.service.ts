/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverOccurrenceFlow,
  DriverOccurrencePhoto,
  DriverOccurrenceType,
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
 * O mesmo veredito do comprovante (`listMissingProofFields`), com um plano de um campo só: a foto,
 * no `attachmentMode` do tipo. A regra de "obrigatório falta" é uma só no app.
 */
export function listMissingOccurrenceFields(input: {
  readonly hasPhoto: boolean
  readonly type: DriverOccurrenceType
}): readonly ProofFieldKey[] {
  const plan = resolveProofFormPlan({
    photo: resolveOccurrenceAttachmentMode(input.type),
    receivedBy: 'off',
    receiverDocument: 'off',
    receiverName: 'off',
    signature: 'off',
  })
  return listMissingProofFields({
    plan,
    values: {
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

/** As três rotas que já existiam — o formulário único só escolhe uma delas. */
export type OccurrenceRegistrationHandlers = Readonly<{
  /** D3: nota com foto — o item `documentOccurrence` da fila, que sobe a foto antes do registro. */
  enqueueDocumentOccurrence: (input: {
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
    readonly occurrenceTypeName: string
    readonly photo: DriverOccurrencePhoto
  }) => void
  /** Spec 079: nota sem foto — a chamada direta de sempre, sem fila. */
  registerDocumentOccurrence: (input: {
    readonly documentId: string
    readonly note: string
    readonly occurrenceTypeId: string
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

export type OccurrenceRegistrationRoute = 'document-direct' | 'document-queued' | 'stop'

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

  if (draft.photo !== undefined) {
    handlers.enqueueDocumentOccurrence({
      documentId: input.documentId,
      note,
      occurrenceTypeId: type.id,
      occurrenceTypeName: type.name,
      photo: draft.photo,
    })
    return 'document-queued'
  }

  handlers.registerDocumentOccurrence({
    documentId: input.documentId,
    note,
    occurrenceTypeId: type.id,
  })
  return 'document-direct'
}
