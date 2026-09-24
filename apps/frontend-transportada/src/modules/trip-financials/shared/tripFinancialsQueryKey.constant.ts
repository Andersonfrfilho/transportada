/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * As chaves de consulta do módulo. Dois hooks já escrevem as mesmas strings, e chave redigitada
 * numa delas é invalidação que não chega — falha silenciosa, sem erro nenhum a investigar.
 */
export const TRIP_FINANCIALS_QUERY_KEY = 'trip-financials'
export const TRIP_VALUATION_QUERY_KEY = 'trip-valuation'
export const TRIP_COST_ENTRIES_QUERY_KEY = 'trip-cost-entries'
/** Spec 169 P1: a receita lançada à mão na viagem. */
export const TRIP_REVENUE_ENTRIES_QUERY_KEY = 'trip-revenue-entries'
/** Spec 169 RF5: as espécies ativas do lado certo, para o seletor do lançamento. */
export const COMPANY_ENTRY_KINDS_QUERY_KEY = 'company-entry-kinds'

/** Ler a conta da viagem — margem e o que se paga ao agregado (spec 061 D4). */
export const FINANCIALS_PERMISSION = 'trip.financials'
/** Mexer na viagem: é ela que abre o formulário de lançamento, não a de leitura. */
export const TRIP_MANAGE_PERMISSION = 'trip.manage'
/** Spec 169 RF7: o cadastro de espécie exige a mesma permissão dos demais cadastros da empresa. */
export const SETTINGS_MANAGE_PERMISSION = 'settings.manage'
