/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 (T3.2 / T6.1): o índice que a junção `nfe_participants` ⋈ `nfe_addresses` precisa. O nome, as
 * colunas e a definição que o Postgres devolve moram aqui, e os contratos estático e de banco leem esta
 * lista, nunca uma cópia.
 */
export const MIGRATION_SUFFIX = '_nfe_addresses_participant_index'
export const INDEX_NAME = 'nfe_addresses_company_participant_idx'
export const POSTGRES_IDENTIFIER_MAX_BYTES = 63
export const INDEX_COLUMNS = ['company_id', 'participant_id'] as const

export const INDEX_DEFINITION = `CREATE INDEX ${INDEX_NAME} ON public.nfe_addresses USING btree (company_id, participant_id)`
