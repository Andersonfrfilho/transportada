/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: o **grupo** do tipo, que é a única parte fixa do produto.
 *
 * ⚠️ Os tipos deixaram de ser cópia por valor em 2026-09-03: eles são cadastro da empresa e vêm do
 * servidor. O que continua fixo é o grupo — `separation` é do galpão e `delivery` é da rua —,
 * porque é ele que decide quem registra, e isso é regra do produto, não escolha de quem cadastra.
 */

export const TRIP_OCCURRENCE_STAGE = {
  delivery: 'delivery',
  separation: 'separation',
} as const

export type TripOccurrenceStage = (typeof TRIP_OCCURRENCE_STAGE)[keyof typeof TRIP_OCCURRENCE_STAGE]

/**
 * Spec 164 D1/RF1: `unset` é o padrão e é o que o produto faz hoje — anota e para. A transportadora
 * decide tipo a tipo, quando quiser; ocorrência de tipo `unset` não abre tratativa.
 */
export const OCCURRENCE_REDELIVERY_POLICY = {
  allowed: 'allowed',
  blocked: 'blocked',
  unset: 'unset',
} as const

export type OccurrenceRedeliveryPolicy =
  (typeof OCCURRENCE_REDELIVERY_POLICY)[keyof typeof OCCURRENCE_REDELIVERY_POLICY]

/**
 * Spec 179 RF1: se a ocorrência daquele tipo exige foto. Nasce `off`, o padrão da coluna — o mesmo
 * trio da prova de entrega.
 */
export const OCCURRENCE_ATTACHMENT_MODE = {
  off: 'off',
  optional: 'optional',
  required: 'required',
} as const

export type OccurrenceAttachmentMode =
  (typeof OCCURRENCE_ATTACHMENT_MODE)[keyof typeof OCCURRENCE_ATTACHMENT_MODE]

/** O tipo como o servidor o devolve. `active` aposentado aparece apagado, nunca some da lista. */
export type OccurrenceType = Readonly<{
  active: boolean
  /**
   * Spec 166 RF3/RF8/RF9: tipo com o interruptor desligado só aceita **um** item por ocorrência —
   * o campo de item vira seleção única, e trocar a escolha substitui em vez de somar. Padrão
   * `true` preserva o comportamento de hoje.
   */
  allowsMultipleItems: boolean
  /** Spec 179 RF1: a foto é exigida, opcional ou fora do registro. */
  attachmentMode: OccurrenceAttachmentMode
  /** Legado: o e-mail digitado no próprio tipo, antes de o texto morar no módulo de notificações. */
  emailBody: string
  emailSubject: string
  /** A chave do template do módulo de notificações que o tipo seleciona; nula é o legado. */
  emailTemplateKey: null | string
  /** Spec 183 T802: o tipo avisa a contratante por e-mail quando a ocorrência é registrada. */
  emailsContractor: boolean
  id: string
  name: string
  notifies: boolean
  /** Spec 164 D1/RF1: se aquele fato admite reentrega. Nasce `unset`, CHECK no banco. */
  redeliveryPolicy: OccurrenceRedeliveryPolicy
  stage: TripOccurrenceStage
}>
