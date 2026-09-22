/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * As chaves de consulta do módulo. Dois hooks já escrevem as mesmas strings, e chave redigitada
 * numa delas é invalidação que não chega — falha silenciosa, sem erro nenhum a investigar.
 */
export const TRIP_FINANCIALS_QUERY_KEY = 'trip-financials'
export const TRIP_VALUATION_QUERY_KEY = 'trip-valuation'
export const TRIP_COST_ENTRIES_QUERY_KEY = 'trip-cost-entries'

/** Ler a conta da viagem — margem e o que se paga ao agregado (spec 061 D4). */
export const FINANCIALS_PERMISSION = 'trip.financials'
/** Mexer na viagem: é ela que abre o formulário de lançamento, não a de leitura. */
export const TRIP_MANAGE_PERMISSION = 'trip.manage'
