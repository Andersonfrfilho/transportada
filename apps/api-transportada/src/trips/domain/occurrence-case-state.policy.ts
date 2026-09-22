/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RedeliveryPolicy,
  TripOccurrenceCaseDecisionKind,
  TripOccurrenceCaseStatus,
} from '../../database/trip.schema.js'

/**
 * Spec 164 T2: a máquina da tratativa de ocorrência.
 *
 * ```
 * recorded ─review─→ under_review ─warehouse_return─→ returned_to_warehouse   (terminal)
 *    │                          └─contractor_submission─→ awaiting_contractor
 *    │                                                       │
 *    └──────────────────cancel──────────────────────┐  decide│
 *                                                     ↓       ↓
 *                                                cancelled  decided ─closure─→ closed   (terminal)
 *                                                (terminal)
 * ```
 *
 * ⚠️ **Molde de `checkDeliveryChargeTransition`** (`delivery-clients/domain/delivery-charge-state.policy.ts`),
 * **não** de `checkTripTransition` deste mesmo diretório (`trip-state.policy.ts`, forma
 * `applied | unchanged | blocked`). A divergência é deliberada: esta máquina tem ator externo (o
 * contratante decide pelo portal, T9/T10), a recusa vira **409 idempotente** para quem repete a
 * chamada de rede, e é a mesma forma de `delivery_charges` — dinheiro/decisão externa no meio — que
 * `occurrence-charge.policy.ts` (T17) vai encostar do outro lado da ponte.
 *
 * Duas decisões do usuário que mudam o desenho da T1 (migration ainda não publicada, ajustada nesta
 * mesma árvore):
 *
 * 1. **Estado terminal `cancelled`, ação `cancel`.** Ocorrência aberta por engano. Sai **só** de
 *    `recorded` e `under_review` — nunca de `awaiting_contractor` em diante, pela mesma razão da D4
 *    do spec.md: depois que o contratante viu, esconder é reescrever o que ele já leu.
 * 2. **`decide` aceita ator interno.** O escritório pode decidir no lugar do contratante que não
 *    responde — tipicamente `other`, com nota obrigatória (validada em outra camada: aqui a máquina
 *    só sabe status e política de reentrega, não quem está chamando). A trilha grava
 *    `actor_kind = 'internal'` quando é o caso (T5); **quem pode chamar `decide` é autorização, não
 *    esta política** — `checkOccurrenceCaseTransition` decide se a transição é válida, nunca quem
 *    tem permissão para pedi-la.
 *
 * `returned_to_warehouse`, `closed` e `cancelled` são os três terminais — nenhuma ação sai deles de
 * novo (ver `OCCURRENCE_CASE_TERMINAL_STATUSES`, e o teste que varre as seis ações contra os três).
 *
 * ⚠️ **`returned_to_warehouse` não é `trip_documents.separation_status = 'returned'`** — um é a
 * tratativa morrendo no galpão (D4 do spec.md), o outro é a nota devolvida na rua, e são fatos
 * independentes. **Nenhuma transição desta política escreve em `trip_documents`**; roteiro e
 * liberação de nota continuam sendo decisão confirmada por gente, em `redelivery-proposal.policy.ts`
 * (T14, RF17) e no `PATCH /trips/:id/stops/order` que já existe (RF18) — fora do alcance desta
 * máquina.
 */
export const OCCURRENCE_CASE_ACTIONS = [
  'review',
  'warehouse_return',
  'contractor_submission',
  'decide',
  'closure',
  'cancel',
] as const
export type OccurrenceCaseAction = (typeof OCCURRENCE_CASE_ACTIONS)[number]

/**
 * Uma fonte só para "o que é terminal" — hoje o CHECK de `trip_occurrence_cases_resolved_check` e o
 * de `trip_occurrence_case_events_terminal_check` (`database/trip.schema.ts`) repetem esta mesma
 * lista em SQL; o teste de contrato confere os três contra o mesmo vocabulário.
 */
export const OCCURRENCE_CASE_TERMINAL_STATUSES = [
  'returned_to_warehouse',
  'closed',
  'cancelled',
] as const satisfies readonly TripOccurrenceCaseStatus[]

const TRANSITIONS: Readonly<
  Record<
    OccurrenceCaseAction,
    {
      readonly from: readonly TripOccurrenceCaseStatus[]
      readonly to: TripOccurrenceCaseStatus
    }
  >
> = Object.freeze({
  cancel: { from: ['recorded', 'under_review'], to: 'cancelled' },
  closure: { from: ['decided'], to: 'closed' },
  contractor_submission: { from: ['under_review'], to: 'awaiting_contractor' },
  decide: { from: ['awaiting_contractor'], to: 'decided' },
  review: { from: ['recorded'], to: 'under_review' },
  warehouse_return: { from: ['under_review'], to: 'returned_to_warehouse' },
})

export const OCCURRENCE_CASE_TRANSITION_REFUSALS = {
  /** RF7: tratativa `blocked` sem item para acertar não tem pergunta a fazer ao contratante. */
  redeliveryBlockedHasNoQuestion: 'OCCURRENCE_CASE_REDELIVERY_BLOCKED_HAS_NO_QUESTION',
  /** RF16: o tipo diz que aquele fato não admite segunda tentativa. */
  redeliveryNotAllowed: 'OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED',
  /** Fechar decisão `goods_paid` sem nenhum item acertado é fechar sem cobrar o que foi decidido. */
  settlementWithoutItems: 'OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS',
  /** O estado atual não permite a ação — e a mensagem, em quem a lança (T3), diz para onde ela iria. */
  transitionNotAllowed: 'OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED',
} as const

/** `code` é união literal, nunca `string` — quem consome (rotas, T7) recebe um código estável. */
export type OccurrenceCaseTransitionRefusalCode =
  (typeof OCCURRENCE_CASE_TRANSITION_REFUSALS)[keyof typeof OCCURRENCE_CASE_TRANSITION_REFUSALS]

export type OccurrenceCaseTransition =
  | { readonly kind: 'changed'; readonly to: TripOccurrenceCaseStatus }
  /** Repetir a mesma ação converge em vez de estourar: a rede cai, o operador toca duas vezes. */
  | { readonly kind: 'unchanged'; readonly to: TripOccurrenceCaseStatus }
  | { readonly code: OccurrenceCaseTransitionRefusalCode; readonly kind: 'refused' }

export type CheckOccurrenceCaseTransitionInput = {
  readonly action: OccurrenceCaseAction
  readonly status: TripOccurrenceCaseStatus
  /** A política do tipo copiada para a tratativa no registro (RF2) — nunca `'unset'` aqui. */
  readonly redeliveryPolicy: RedeliveryPolicy
  /**
   * Em `decide`: a decisão que está sendo aplicada agora. Em `closure`: a decisão já gravada na
   * tratativa (RF23). Nas demais ações ainda não existe decisão — `null`.
   */
  readonly decisionKind: TripOccurrenceCaseDecisionKind | null
  /** Existe ao menos um item de `trip_occurrence_item_settlements` gravado para esta ocorrência. */
  readonly hasSettlementItems: boolean
}

export function checkOccurrenceCaseTransition(
  input: CheckOccurrenceCaseTransitionInput,
): OccurrenceCaseTransition {
  const transition = TRANSITIONS[input.action]
  if (input.status === transition.to) return { kind: 'unchanged', to: transition.to }
  if (!transition.from.includes(input.status)) {
    return { code: OCCURRENCE_CASE_TRANSITION_REFUSALS.transitionNotAllowed, kind: 'refused' }
  }

  if (
    input.action === 'contractor_submission' &&
    input.redeliveryPolicy === 'blocked' &&
    !input.hasSettlementItems
  ) {
    return {
      code: OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryBlockedHasNoQuestion,
      kind: 'refused',
    }
  }

  if (
    input.action === 'decide' &&
    input.decisionKind === 'redelivery_authorized' &&
    input.redeliveryPolicy === 'blocked'
  ) {
    return { code: OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryNotAllowed, kind: 'refused' }
  }

  if (
    input.action === 'closure' &&
    input.decisionKind === 'goods_paid' &&
    !input.hasSettlementItems
  ) {
    return { code: OCCURRENCE_CASE_TRANSITION_REFUSALS.settlementWithoutItems, kind: 'refused' }
  }

  return { kind: 'changed', to: transition.to }
}
