/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Dinheiro na fronteira HTTP é texto com as quatro casas de `numeric(19,4)` — nunca float binário,
 * nunca duas casas de exibição. Sete módulos declaravam esta mesma expressão; divergir uma delas
 * afrouxaria uma fronteira sem tocar no arquivo que parecia ser a regra.
 */
export const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/
