/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve (`apps/api-transportada/src/shared/cargo-arrival.constant.ts`). */
export const CARGO_ARRIVAL_STATUSES = ['open', 'closed'] as const
export const CARGO_DOCUMENT_STATES = ['expected', 'received', 'separated'] as const

/** ⚠️ Cópia por valor do piso da API (`CARGO_ARRIVAL_LIMITS.arrivedAtMaxAgeMs`): 30 dias para trás. */
const ARRIVED_AT_MAX_AGE_DAYS = 30

export const CARGO_ARRIVAL_LIMITS = {
  arrivedAtMaxAgeDays: ARRIVED_AT_MAX_AGE_DAYS,
  arrivedAtMaxAgeMs: ARRIVED_AT_MAX_AGE_DAYS * 24 * 60 * 60_000,
  /** A leitura periódica da chegada aberta: curta o bastante para ver o colega, longa para não pesar. */
  detailRefetchIntervalMs: 20_000,
  documentsPerRequest: 300,
  /** A folga do relógio de quem digita a hora: além disso a chegada está no futuro. */
  futureToleranceMs: 2 * 60_000,
  /** O teto da página da API; tanto a lista de chegadas quanto a de notas seguem o cursor de 100 em 100. */
  pageSize: 100,
  palletCountMax: 2_147_483_647,
  referenceMaxLength: 120,
  routeNameMaxLength: 40,
} as const

/** Ler é `fleet.read` e escrever é `trip.manage`, como na API (`cargo-arrival-http.support.ts`). */
export const CARGO_RECEIVING_WRITE_PERMISSION = 'trip.manage'

/** Desfazer a devolução ao contratante é de quem decide a tratativa (`occurrences.resolve`), nunca do separador. */
export const CARGO_RECEIVING_RESOLVE_PERMISSION = 'occurrences.resolve'

export const CARGO_RECEIVING_WORKSPACE = 'cargo-receiving'

export const CARGO_RECEIVING_PATHS = {
  arrivals: '/cargo-arrivals',
  availableDocuments: '/cargo-arrivals/available-documents',
  contractors: '/contractors',
  receivingProfiles: '/contractor-receiving-profiles',
} as const

export const CARGO_RECEIVING_ERROR = {
  /** O cursor da página seguinte nasceu noutra ordem: a lista recomeça do início. */
  CURSOR_ORDER_MISMATCH: 'CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH',
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

export const CARGO_RECEIVING_QUERY_KEY = 'cargo-receiving'

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key'
