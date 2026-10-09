/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const HOLIDAY_PROVIDER_PULL_JOB = 'holiday.provider.pull'

export const FERIADOS_API_BASE_URL = 'https://feriadosapi.com'

/** O máximo que a documentação aceita em `limit`. */
export const FERIADOS_API_PAGE_SIZE = 100

export const FERIADOS_API_REQUEST_TIMEOUT_MILLISECONDS = 15_000

/** Descoberta (ADR-0100 §5): até 2.000 notas por lote e 20 lotes por empresa em cada ciclo. */
export const HOLIDAY_DISCOVERY_BATCH_SIZE = 2000
export const HOLIDAY_DISCOVERY_MAX_BATCHES = 20
