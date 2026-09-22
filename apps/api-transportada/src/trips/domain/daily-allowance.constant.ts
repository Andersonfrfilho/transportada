/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Spec 143 D3: sem valor do motorista e sem configuração da empresa, a diária paga isto por dia. */
export const DEFAULT_DAILY_ALLOWANCE_AMOUNT = '200.0000'

/** Spec 143 D4: um dia de diária, em segundos — base do arredondamento de `suggestAllowanceDays`. */
export const DAILY_ALLOWANCE_DAY_SECONDS = 86400

/** Spec 143 D4: nenhuma viagem sugere menos de um dia de diária. */
export const MINIMUM_ALLOWANCE_DAYS = 1
