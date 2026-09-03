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

/** O tipo como o servidor o devolve. `active` aposentado aparece apagado, nunca some da lista. */
export type OccurrenceType = Readonly<{
  active: boolean
  /** Vazio é tipo que não gera e-mail: nem toda ocorrência precisa avisar o embarcador. */
  emailBody: string
  emailSubject: string
  id: string
  name: string
  notifies: boolean
  stage: TripOccurrenceStage
}>

/**
 * ⚠️ **Cópia por valor** de `occurrence-template.policy.ts` — o bundle não carrega código da API. É
 * a lista que a tela mostra a quem escreve o modelo; marcador fora dela é recusado no cadastro, e
 * sem a lista aqui quem escreve descobre isso só ao salvar.
 */
export const OCCURRENCE_TEMPLATE_PLACEHOLDERS = [
  'numeroNota',
  'razaoSocial',
  'valorNota',
  'motorista',
  'parada',
  'item',
] as const
