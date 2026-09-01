/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const IDENTITY_DOCUMENT_BACKFILL_JOB = 'identity.document.backfill'

/** O mesmo nome que a API escreve no convite e na edição. Mudou lá? mude aqui. */
export const IDENTITY_TAX_ID_ATTRIBUTE = 'tax_id'
export const IDENTITY_COMPANY_ID_ATTRIBUTE = 'company_id'

/**
 * O realm é lido em páginas e a rotina não corre a instalação inteira num ciclo: ela converge em
 * poucos dias e para de achar trabalho. Um ciclo que varre tudo de uma vez seria um pico de
 * chamadas ao provedor por uma pressa que ninguém tem.
 */
export const IDENTITY_BACKFILL_PAGE_SIZE = 100
export const IDENTITY_BACKFILL_MAX_PAGES = 20
