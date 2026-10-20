/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DeclaredAmountScope,
  OccurrenceAttachmentMode,
  OccurrenceItemsMode,
  OccurrenceMoment,
  OccurrenceRedeliveryPolicy,
  OccurrenceTypeContractorScope,
  OccurrenceTypeFlow,
  TripOccurrenceStage,
} from './occurrence.constant'
import type {
  ContractorReplyAlertMode,
  ContractorReplyAttachmentKind,
  ContractorReplyMode,
  DuplicateRequestPolicy,
  InformedEmailForwardMode,
  NoteRecipientForwardMode,
} from './occurrenceContractorReply.constant'

/** Spec 270: a contratante que o tipo atende, como o cadastro a devolve (nome e CNPJ vêm prontos). */
export type OccurrenceTypeContractor = Readonly<{
  displayName: string
  id: string
  status: string
  taxId: string
}>

/** Spec 271 (ADR-0108): responsável da empresa escolhido para ir em cópia no e-mail do tipo. */
export type OccurrenceTypeMailWatcher = Readonly<{
  eligible: boolean
  name: string
  status: string
  userId: string
}>

/** Spec 271: contato de contratante escolhido como destinatário do e-mail do tipo (só tipo `listed`). */
export type OccurrenceTypeMailRecipient = Readonly<{
  contactId: string
  contractorId: string
  email: string
  name: string
  receivesOccurrences: boolean
  status: string
}>

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
  /**
   * Spec 247 RF1: o valor pago digitado — modo, rótulo e onde se digita. Ausente é API anterior aos
   * campos: a aba não oferece as linhas e o `PUT` nunca as manda.
   */
  declaredAmountLabel?: string
  declaredAmountMode?: OccurrenceAttachmentMode
  declaredAmountScope?: DeclaredAmountScope
  /** Spec 271: o bloco "E-mail à contratante" do tipo. Todos ausentes numa API anterior. */
  contractorMailRecipients?: readonly OccurrenceTypeMailRecipient[]
  contractorMailWatchers?: readonly OccurrenceTypeMailWatcher[]
  contractorNotificationTemplateKey?: null | string
  missingNotificationTemplate?: boolean
  /**
   * Spec 270 (ADR-0107): para quem o tipo vale. Ausente é API anterior ao campo: lê-se como `all`, e o
   * `PUT` nunca o manda. `contractors` é a lista do tipo `listed`, ordenada por nome pela API.
   */
  contractorScope?: OccurrenceTypeContractorScope
  contractors?: readonly OccurrenceTypeContractor[]
  /** Spec 183 T802: o tipo avisa a contratante sozinho no registro. Ausente é API anterior ao campo. */
  emailsContractor?: boolean
  /** Spec 248 RF1: o retorno da contratante — todos opcionais; ausentes são API anterior aos campos. */
  contractorReplyAlertIntervalMinutes?: number
  contractorReplyAlertMaxCount?: number
  contractorReplyAlertMode?: ContractorReplyAlertMode
  contractorReplyAttachmentKind?: ContractorReplyAttachmentKind
  contractorReplyMode?: ContractorReplyMode
  /** Spec 276 T3b: ausente é API anterior ao campo (lê como desligado). */
  contractorReplyResolveOnDelivery?: boolean
  contractorReplyWaitHours?: null | number
  driverReplyTemplate?: string
  /** Spec 276 T4: o pedido repetido na mesma nota. Ausente é API anterior ao campo. */
  duplicateRequestPolicy?: DuplicateRequestPolicy
  forwardEmailBody?: string
  forwardEmailSubject?: string
  forwardToInformedEmail?: InformedEmailForwardMode
  forwardToNoteRecipient?: NoteRecipientForwardMode
  /** A chave do template do módulo de notificações que o tipo seleciona; nula é o legado. */
  emailTemplateKey: null | string
  /** Spec 255 RF1: o ícone do design system; nulo ou ausente é sem ícone. Ausente é API anterior. */
  iconName?: null | string
  /** Spec 218 (D1, RF-B5): qual botão do motorista este tipo alimenta. Ausente na API é `document`. */
  flow: OccurrenceTypeFlow
  id: string
  /**
   * Spec 246 RF1c2: nulo é "todos os itens da nota"; só vale com `itemsMode = 'required'`. Ausente é API
   * anterior ao campo: o painel não oferece o controle e nunca o manda de volta.
   */
  itemsMinimumCount?: null | number
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
  /**
   * Spec 246 RF1: a exigência da observação. Ausente é API anterior ao campo (que recusa a chave com
   * `.strict()`): o painel não oferece o controle e o `PUT` não o manda.
   */
  noteMode?: OccurrenceAttachmentMode
  notifies: boolean
  /** Spec 246 RF1c: de 1 a 5, lida só com a foto `required`. Ausente é API anterior ao campo (mesma regra). */
  photoMinimumCount?: number
  /** Spec 247 RF1: o número do documento do cliente (ex.: a NFD) — rótulo e modo. Ausente é API anterior. */
  referenceNumberLabel?: string
  referenceNumberMode?: OccurrenceAttachmentMode
  /** Spec 164 D1/RF1: se aquele fato admite reentrega. Nasce `unset`, CHECK no banco. */
  redeliveryPolicy: OccurrenceRedeliveryPolicy
  /** Spec 246 RF1: a exigência da assinatura. Ausente é API anterior ao campo (mesma regra). */
  signatureMode?: OccurrenceAttachmentMode
  stage: TripOccurrenceStage
}>

/**
 * Spec 246 D-a (RF4): na exceção, os cinco campos novos são modo-ou-nulo — nulo herda do tipo,
 * campo a campo. Ausente é API anterior: lê-se como nulo (herda), e nunca é mandado de volta.
 */
type OccurrenceRequirementOverrideFields = Readonly<{
  /** Spec 247 D8: os dois modos da devolução com somas — também modo-ou-nulo, e nunca reenviados sem edição. */
  declaredAmountMode?: null | OccurrenceAttachmentMode
  itemsMinimumCount?: null | number
  itemsMode?: null | OccurrenceItemsMode
  noteMode?: null | OccurrenceAttachmentMode
  photoMinimumCount?: null | number
  referenceNumberMode?: null | OccurrenceAttachmentMode
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
