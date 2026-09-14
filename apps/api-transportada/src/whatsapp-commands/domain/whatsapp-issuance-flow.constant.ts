/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — o ramo "Emitir documentos". Ids de nó, `actionKind` e chaves de contexto num
 * lugar só: o grafo e as FlowActions importam daqui, nunca redeclaram a string solta.
 *
 * ⚠️ O `context` da sessão é jsonb persistido: só ids opacos e valores não sensíveis. O emitente
 * entra pela chave opaca de `buildEmitterKey`, nunca pelo CNPJ/CPF — produtor rural emite com CPF.
 */
export const ISSUANCE_FLOW_ACTION_KIND = {
  confirmRouter: 'issuance.confirm_router',
  paramRouter: 'issuance.param_router',
  prompt: 'issuance.prompt',
  start: 'issuance.start',
} as const

export const ISSUANCE_FLOW_NODE = {
  confirmEntry: 'issuance_confirm_entry',
  confirmRouter: 'issuance_confirm_router',
  criterionMenu: 'issuance_criterion_menu',
  paramEntry: 'issuance_param_entry',
  paramRouter: 'issuance_param_router',
  prompt: 'issuance_prompt',
  start: 'issuance_start',
} as const

export const ISSUANCE_FLOW_CONTEXT_KEY = {
  answer: 'issuanceAnswer',
  confirmAnswer: 'issuanceConfirmAnswer',
  criterion: 'issuanceCriterion',
  dueDays: 'issuanceDueDays',
  emitterKey: 'issuanceEmitterKey',
  endDate: 'issuanceEndDate',
  firstNumber: 'issuanceFirstNumber',
  lastNumber: 'issuanceLastNumber',
  listPage: 'issuanceListPage',
  period: 'issuancePeriod',
  requestId: 'issuanceRequestId',
  series: 'issuanceSeries',
  startDate: 'issuanceStartDate',
  step: 'issuanceStep',
  tripId: 'issuanceTripId',
} as const

export const ISSUANCE_CRITERIA = ['number_range', 'trip', 'issue_date', 'sender'] as const
export type IssuanceCriterion = (typeof ISSUANCE_CRITERIA)[number]

/** O vencimento da fatura, em dias a partir de hoje (D6.1). */
export const ISSUANCE_DUE_DAYS_OPTIONS = [7, 15, 30] as const

/** Abrir o ramo pede qualquer uma das duas; a conferência completa é na confirmação (T013). */
export const ISSUANCE_OPEN_PERMISSIONS = ['cte.submit', 'nfse.issue'] as const

export const ISSUANCE_PERIOD_SKIP_ANSWER = 'skip'
export const ISSUANCE_BACK_ANSWER = 'back'
/** O botão de confirmar leva o id do pedido: é ele, e não a mensagem, que a confirmação confere. */
export const ISSUANCE_CONFIRM_ANSWER_PREFIX = 'confirm_request:'

/** D5: a prévia vale 15 minutos. */
export const ISSUANCE_PREVIEW_TTL_MINUTES = 15
/** "Viagens abertas ou despachadas recentes" (D4): as criadas nos últimos 14 dias, menos as canceladas. */
export const ISSUANCE_TRIP_WINDOW_DAYS = 14
/** Até quantos números a mensagem de bloqueados lista por motivo antes do "e mais K". */
export const ISSUANCE_BLOCKED_NUMBERS_PER_REASON = 10
