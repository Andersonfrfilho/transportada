/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Menos dígitos impressos que isto é ruído (o DANFE imprime o Nº com 9 dígitos: 000.172.195). */
export const CANHOTO_IDENTITY_MIN_NUMBER_DIGITS = 3
/** `nNF` da NF-e tem no máximo 9 dígitos; mais que isso não é número de nota. */
export const CANHOTO_IDENTITY_MAX_NUMBER_DIGITS = 9
/** O rótulo da série tolera um erro de leitura ("SER1E", "5ÉRIE"); o número, nenhum (spec 344, casos extremos). */
export const CANHOTO_IDENTITY_SERIES_LABEL = 'SERIE'
export const CANHOTO_IDENTITY_SERIES_LABEL_MAX_DISTANCE = 1
