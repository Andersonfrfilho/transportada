/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Unidades de tempo em milissegundos, para conta com `Date#getTime()` — uma cópia por arquivo
 * (spec 159 tinha três) é o jeito de uma delas errar um zero sem ninguém ver.
 */
export const MILLISECONDS_PER_MINUTE = 60 * 1000
export const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE
export const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR
