/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverOccurrencePhoto,
  DriverOccurrenceSignature,
  DriverOccurrenceType,
} from './driverTrip.types'
import {
  listMissingOccurrenceFields,
  resolveOccurrenceAttachmentMode,
  resolveOccurrenceFlow,
} from './occurrenceRegistration.service'
import { resolveOccurrenceFieldVisibility } from './occurrenceRequirements.service'

/**
 * Spec 218 (RF-A5, D1–D4) e 246: a saída do botão único — o rascunho, as duas rotas e a escolha
 * entre elas. Separado do gate (`occurrenceRegistration.service.ts`) para cada arquivo ter um assunto.
 */

export type OccurrenceRegistrationDraft = Readonly<{
  description: string
  /** Spec 246 (RF1c): as fotos além da primeira, só para o tipo que pede mais de uma. */
  extraPhotos?: readonly DriverOccurrencePhoto[]
  /** Spec 246 (RF1b): a nota inteira apontada — o app não tem a lista de itens para apontar um. */
  hasProducts?: boolean
  photo: DriverOccurrencePhoto | undefined
  signature?: DriverOccurrenceSignature | undefined
}>

/** As duas rotas que existem — o formulário único só escolhe uma delas. */
export type OccurrenceRegistrationHandlers = Readonly<{
  /**
   * D3 + spec 226: nota com ou sem foto — o item `documentOccurrence` da fila, que sobe a foto antes
   * do registro quando há uma. Sem foto o item vai com `photo: null`, e o texto digitado sobrevive
   * à falta de rede. Spec 246: as demais fotos e a assinatura entram **neste mesmo item** (209 D1).
   */
  enqueueDocumentOccurrence: (input: {
    readonly documentId: string
    readonly extraPhotos?: readonly DriverOccurrencePhoto[]
    readonly note: string
    readonly occurrenceTypeId: string
    readonly occurrenceTypeName: string
    readonly photo: DriverOccurrencePhoto | null
    readonly signature?: DriverOccurrenceSignature
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

/** `blocked`: faltou um campo obrigatório — nada entra na fila (RF7: o bloqueio é do botão e daqui). */
export type OccurrenceRegistrationRoute = 'blocked' | 'document-queued' | 'stop'

type EffectiveOccurrenceDraft = Readonly<{
  extraPhotos: readonly DriverOccurrencePhoto[]
  hasProducts: boolean
  note: string
  photo: DriverOccurrencePhoto | undefined
  signature: DriverOccurrenceSignature | undefined
}>

/** O que vale do rascunho: campo que o tipo desliga não sai, nem que tenha sido preenchido antes. */
function toEffectiveDraft(input: {
  readonly draft: OccurrenceRegistrationDraft
  readonly type: DriverOccurrenceType
}): EffectiveOccurrenceDraft {
  const { draft, type } = input
  const visibility = resolveOccurrenceFieldVisibility(type)
  return {
    extraPhotos: visibility.rendersPhoto ? (draft.extraPhotos ?? []) : [],
    hasProducts: visibility.rendersProducts && draft.hasProducts === true,
    note: visibility.rendersNote ? draft.description.trim() : '',
    photo: visibility.rendersPhoto ? draft.photo : undefined,
    signature: visibility.rendersSignature ? draft.signature : undefined,
  }
}

function isDraftComplete(input: {
  readonly effective: EffectiveOccurrenceDraft
  readonly type: DriverOccurrenceType
}): boolean {
  const { effective } = input
  return (
    listMissingOccurrenceFields({
      hasNote: effective.note !== '',
      hasPhoto: effective.photo !== undefined,
      hasProducts: effective.hasProducts,
      hasSignature: effective.signature !== undefined,
      photoCount: (effective.photo === undefined ? 0 : 1) + effective.extraPhotos.length,
      type: input.type,
    }).length === 0
  )
}

/**
 * Uma rota só, a do `flow`. D4: tipo de parada registra **na parada** — a nota é só de onde veio o
 * toque, e não vai junto. Spec 246: rascunho a que falta um campo obrigatório não entra em rota
 * alguma — o botão já o segura, e esta é a segunda trava.
 */
export function dispatchOccurrenceRegistration(input: {
  readonly documentId: string
  readonly draft: OccurrenceRegistrationDraft
  readonly handlers: OccurrenceRegistrationHandlers
  readonly stopId: string
  readonly type: DriverOccurrenceType
}): OccurrenceRegistrationRoute {
  const { handlers, type } = input
  const effective = toEffectiveDraft({ draft: input.draft, type })
  if (!isDraftComplete({ effective, type })) return 'blocked'

  if (resolveOccurrenceFlow(type) === 'stop') {
    handlers.reportStopOccurrence({
      description: effective.note,
      isPhotoRequired: resolveOccurrenceAttachmentMode(type) === 'required',
      occurrenceTypeId: type.id,
      photo: effective.photo,
      stopId: input.stopId,
    })
    return 'stop'
  }

  handlers.enqueueDocumentOccurrence({
    documentId: input.documentId,
    ...(effective.extraPhotos.length === 0 ? {} : { extraPhotos: effective.extraPhotos }),
    note: effective.note,
    occurrenceTypeId: type.id,
    occurrenceTypeName: type.name,
    photo: effective.photo ?? null,
    ...(effective.signature === undefined ? {} : { signature: effective.signature }),
  })
  return 'document-queued'
}
