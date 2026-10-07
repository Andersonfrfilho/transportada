/* Copyright (c) 2026 Ada Technology. MIT License. */

export const LOCATION_RETENTION_PATH = '/company-settings/location-retention'
export const LOCATION_RETENTION_IMPACT_PATH = `${LOCATION_RETENTION_PATH}/impact`

/** Cópia por valor do intervalo da API (CHECK do banco e Zod da rota): 30 a 90 dias inteiros. */
export const LOCATION_RETENTION_DAYS_RANGE = { max: 90, min: 30 } as const

/** O `setTimeout` estoura em 2^31-1 ms e dispara na hora; acima disso reagenda a cada teto. */
export const LOCATION_RETENTION_MAX_TIMER_DELAY_MS = 2_147_483_647

export const LOCATION_RETENTION_ORIGINS = ['company', 'default'] as const

/** Os nomes estáveis da resposta de impacto; o nome da tabela não sai da API. */
export const LOCATION_RETENTION_IMPACT_KINDS = [
  'stop_event',
  'delivery_proof',
  'status_event',
  'stop_occurrence',
  'document_occurrence',
] as const

/** Linguagem de tela: as duas tabelas de ocorrência são uma linha só para quem lê. */
export const LOCATION_RETENTION_IMPACT_GROUPS = [
  { id: 'arrival', kinds: ['stop_event'] },
  { id: 'canhotoPhoto', kinds: ['delivery_proof'] },
  { id: 'statusChange', kinds: ['status_event'] },
  { id: 'occurrence', kinds: ['stop_occurrence', 'document_occurrence'] },
] as const

export const LOCATION_RETENTION_ERROR = {
  NETWORK: 'LOCATION_RETENTION_NETWORK_ERROR',
  REQUEST_FAILED: 'LOCATION_RETENTION_REQUEST_FAILED',
  RESPONSE_INVALID: 'LOCATION_RETENTION_RESPONSE_INVALID',
} as const
