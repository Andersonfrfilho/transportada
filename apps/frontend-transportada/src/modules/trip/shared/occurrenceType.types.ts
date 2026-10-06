/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  OccurrenceAttachmentMode,
  OccurrenceItemsMode,
  OccurrenceMoment,
  OccurrenceRedeliveryPolicy,
  OccurrenceTypeFlow,
  TripOccurrenceStage,
} from './occurrence.constant'

/** O tipo como o servidor o devolve. `active` aposentado aparece apagado, nunca some da lista. */
export type OccurrenceType = Readonly<{
  active: boolean
  /**
   * Spec 166 RF3/RF8/RF9: tipo com o interruptor desligado só aceita **um** item por ocorrência —
   * o campo de item vira seleção única, e trocar a escolha substitui em vez de somar. Padrão
   * `true` preserva o comportamento de hoje.
   */
  allowsMultipleItems: boolean
  /** Spec 179 RF1: a exigência da **foto** no registro do motorista. Ausente na API é `off`. */
  attachmentMode: OccurrenceAttachmentMode
  /** Legado: o e-mail digitado no próprio tipo, antes de o texto morar no módulo de notificações. */
  emailBody: string
  emailSubject: string
  /** A chave do template do módulo de notificações que o tipo seleciona; nula é o legado. */
  emailTemplateKey: null | string
  /** Spec 218 (D1, RF-B5): qual botão do motorista este tipo alimenta. Ausente na API é `document`. */
  flow: OccurrenceTypeFlow
  id: string
  /** Spec 246 RF1c2: nulo é "todos os itens da nota"; só vale com `itemsMode = 'required'`. */
  itemsMinimumCount: null | number
  /**
   * Spec 241 RF10: ausente é API anterior ao campo — o cadastro não oferece o controle e o registro
   * lê `optional`. Por isso não ganha padrão em `toOccurrenceType`.
   */
  itemsMode?: OccurrenceItemsMode
  /**
   * Spec 185 T6.1 (D2, RF6): só para tipos de separação — ocorrência aberta desse tipo, sobre a
   * nota inteira, tira a nota da conta de "carga fechada" (`leavesBehindOnDispatch`) e o despacho a
   * libera da viagem. Padrão `false`: nenhum tipo novo tira nota da viagem sem decisão explícita.
   */
  leavesDocumentBehind: boolean
  /** Spec 246 RF0: ausente é API anterior ao campo — o painel segue por `stage`/`flow`. */
  moments?: readonly OccurrenceMoment[]
  name: string
  /** Spec 246 RF1: a exigência da observação. Ausente na API é `optional`, o de hoje. */
  noteMode: OccurrenceAttachmentMode
  notifies: boolean
  /** Spec 246 RF1c: de 1 a 5, lida só com a foto `required`. Ausente na API é 1. */
  photoMinimumCount: number
  /** Spec 164 D1/RF1: se aquele fato admite reentrega. Nasce `unset`, CHECK no banco. */
  redeliveryPolicy: OccurrenceRedeliveryPolicy
  /** Spec 246 RF1: a exigência da assinatura. Ausente na API é `off`. */
  signatureMode: OccurrenceAttachmentMode
  stage: TripOccurrenceStage
}>

/**
 * Spec 246 D-a (RF4): na exceção, os cinco campos novos são modo-ou-nulo — nulo herda do tipo,
 * campo a campo. Ausente é API anterior: lê-se como nulo (herda), e nunca é mandado de volta.
 */
type OccurrenceRequirementOverrideFields = Readonly<{
  itemsMinimumCount?: null | number
  itemsMode?: null | OccurrenceItemsMode
  noteMode?: null | OccurrenceAttachmentMode
  photoMinimumCount?: null | number
  signatureMode?: null | OccurrenceAttachmentMode
}>

/**
 * Spec 218 RF-B1/RF-B3: as duas listas de exceção do `attachmentMode` de um tipo, por contratante e
 * por destinatário — mesmo par que a tela de comprovante já tem, um `attachmentMode` por chave.
 */
export type OccurrenceAttachmentContractorOverride = OccurrenceRequirementOverrideFields &
  Readonly<{
    attachmentMode: OccurrenceAttachmentMode
    contractorId: string
  }>

export type OccurrenceAttachmentRecipientOverride = OccurrenceRequirementOverrideFields &
  Readonly<{
    attachmentMode: OccurrenceAttachmentMode
    taxId: string
  }>

export type OccurrenceAttachmentOverrides = Readonly<{
  contractorOverrides: readonly OccurrenceAttachmentContractorOverride[]
  recipientOverrides: readonly OccurrenceAttachmentRecipientOverride[]
}>

/** Spec 246 RF11c: as exceções de todos os tipos da empresa, numa consulta só. */
export type OccurrenceAttachmentOverridesByType = readonly (OccurrenceAttachmentOverrides &
  Readonly<{ occurrenceTypeId: string }>)[]
