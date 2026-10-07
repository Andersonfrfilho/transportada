/* Copyright (c) 2026 Ada Technology. MIT License. */

/** As seis ações do escritório sobre a tratativa; o segmento é o de `/trip-occurrences/:id/case/*` da API. */
export const CARGO_CASE_ACTIONS = [
  'review',
  'submit',
  'decide',
  'close',
  'warehouse-return',
  'cancel',
] as const

export const CARGO_CASE_ACTION_SEGMENT = {
  cancel: 'cancel',
  close: 'closure',
  decide: 'decision',
  review: 'review',
  submit: 'contractor-submission',
  'warehouse-return': 'warehouse-return',
} as const

/** `occurrence-case.schema.ts`: nota obrigatória em decidir, devolver ao galpão e cancelar. */
export const CARGO_CASE_NOTE_REQUIRED_ACTIONS: readonly string[] = [
  'decide',
  'warehouse-return',
  'cancel',
]

/** Sem `redelivery_authorized`: a política `blocked` da avaria de recebimento a recusa com 422. */
export const CARGO_CASE_DECISION_KINDS = ['other', 'goods_paid'] as const

export const CARGO_CASE_NOTE_MAX_LENGTH = 2000

export const CARGO_CASE_PATHS = { occurrences: '/trip-occurrences' } as const

/** Sem `driver`: a avaria de recebimento não tem viagem, e o motorista exigiria um `payerId`. */
export const CARGO_SETTLEMENT_PAYER_KINDS = ['carrier', 'contractor', 'insurer'] as const
/** O que a API devolve na leitura do acerto: aceita também o motorista, que a tela não oferece. */
export const CARGO_SETTLEMENT_API_PAYER_KINDS = [...CARGO_SETTLEMENT_PAYER_KINDS, 'driver'] as const
export const CARGO_SETTLEMENT_AMOUNT_SOURCE = { manual: 'manual', nfe: 'nfe' } as const
export const CARGO_SETTLEMENT_ITEMS_MAX = 200

export const CARGO_CASE_ERROR = {
  settlementWithoutItems: 'OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS',
} as const

export const CARGO_CASE_QUERY_SEGMENT = { settlement: 'settlement' } as const
