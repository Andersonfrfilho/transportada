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

/** O tipo como o servidor o devolve. `active` aposentado aparece apagado, nunca some da lista. */
export type OccurrenceType = Readonly<{
  active: boolean
  /**
   * Spec 166 RF3/RF8/RF9: tipo com o interruptor desligado só aceita **um** item por ocorrência —
   * o campo de item vira seleção única, e trocar a escolha substitui em vez de somar. Padrão
   * `true` preserva o comportamento de hoje.
   */
  allowsMultipleItems: boolean
  /** Legado: o e-mail digitado no próprio tipo, antes de o texto morar no módulo de notificações. */
  emailBody: string
  emailSubject: string
  /** A chave do template do módulo de notificações que o tipo seleciona; nula é o legado. */
  emailTemplateKey: null | string
  id: string
  /**
   * Spec 185 T6.1 (D2, RF6): só para tipos de separação — ocorrência aberta desse tipo, sobre a
   * nota inteira, tira a nota da conta de "carga fechada" (`leavesBehindOnDispatch`) e o despacho a
   * libera da viagem. Padrão `false`: nenhum tipo novo tira nota da viagem sem decisão explícita.
   */
  leavesDocumentBehind: boolean
  name: string
  notifies: boolean
  /** Spec 164 D1/RF1: se aquele fato admite reentrega. Nasce `unset`, CHECK no banco. */
  redeliveryPolicy: OccurrenceRedeliveryPolicy
  stage: TripOccurrenceStage
}>
